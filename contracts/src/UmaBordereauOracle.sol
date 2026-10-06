// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

import {ProtocolRoles, ProtocolRoleConstants} from "./ProtocolRoles.sol";
import {PortfolioRegistry} from "./PortfolioRegistry.sol";
import {BordereauOracle} from "./BordereauOracle.sol";
import {IOptimisticOracleV3, IOptimisticOracleV3CallbackRecipient} from "./interfaces/uma/IOptimisticOracleV3.sol";

/// @title UmaBordereauOracle
/// @author Anton Carlo Santoro
/// @notice Bordereau attestations backed by UMA's Optimistic Oracle V3. It replaces the
///         stand-in `BordereauOracle`, which has a liveness window and a dispute path but
///         no bond: here a proposer puts real USDC behind the claim, anyone can challenge
///         it by matching that bond, and a challenged claim is decided by UMA's oracle,
///         not by this protocol.
///
///         DROP-IN FOR THE READERS. The assertion record, its enums and the read functions
///         (`getAssertion`, `getAssertionCount`, `isFinalized`, `latestFinalized`,
///         `finalizeAssertion`) are those of `BordereauOracle`, so NextBlockLens, the
///         claims keeper and the app read it unchanged. What differs is how an assertion
///         comes to exist and how it ends:
///           propose    pulls the bond from the proposer and opens a UMA assertion;
///           dispute    the Sentinel (or anyone, directly on UMA) matches the bond;
///           finalize   after the window, settles on UMA; the bond returns to the proposer;
///           a dispute  is resolved by UMA's oracle; the callback below records the outcome.
///
///         HARD BOUNDARIES (unchanged from the stand-in):
///         - Finalization has NO economic effect on the protocol: it never authorizes a
///           payout, a premium split or an allocation. It makes bordereau data verifiable.
///         - This contract is a conduit for bonds and keeps none: its balance of the bond
///           currency is zero between transactions. The bond sits in UMA's oracle and goes
///           back to whoever UMA says it belongs to.
///         - The Claims Committee has no power over a dispute. A challenged claim is settled
///           by UMA; that is the point of using it.
///         - Only UMA's oracle may call the callbacks. They never revert on unknown ids and
///           are idempotent, because a reverting callback must not be able to block
///           settlement.
contract UmaBordereauOracle is ProtocolRoleConstants, IOptimisticOracleV3CallbackRecipient, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // --- Constants ---
    /// @notice Default liveness window: 2 days (same as the stand-in).
    uint64 public constant DEFAULT_LIVENESS = 2 days;
    /// @notice Shortest liveness window the owner may configure (same as the stand-in).
    uint64 public constant LIVENESS_FLOOR = 1 hours;
    /// @notice Longest liveness window the owner may configure (same as the stand-in).
    uint64 public constant LIVENESS_CEILING = 30 days;
    /// @notice Longest dataset pointer accepted: it is written into the claim UMA's voters read.
    uint256 public constant MAX_DATA_URI_LENGTH = 256;
    /// @notice Groups NextBlock's assertions on UMA, for anyone filtering by domain.
    bytes32 public constant DOMAIN_ID = keccak256("NEXTBLOCK_BORDEREAU");
    /// @notice The configured bond may not exceed this many whole units of the bond currency.
    uint256 public constant MAX_BOND_UNITS = 1_000_000;

    // --- Immutable wiring ---
    /// @notice Central protocol access manager (on-chain RBAC).
    ProtocolRoles public immutable protocolRoles;
    /// @notice Institutional portfolio registry (asserted ids must exist).
    PortfolioRegistry public immutable portfolioRegistry;
    /// @notice UMA's Optimistic Oracle V3 on this chain.
    IOptimisticOracleV3 public immutable oracle;
    /// @notice The currency bonds are posted in (USDC).
    IERC20 public immutable bondCurrency;
    /// @notice The UMA identifier assertions are made under (UMA's default, ASSERT_TRUTH).
    bytes32 public immutable identifier;
    /// @notice The largest bond governance may configure, in base units.
    uint256 public immutable maxBond;

    // --- Configuration ---
    /// @notice Liveness window (seconds) a proposed assertion must survive.
    uint64 public liveness;
    /// @notice The bond the protocol asks for, in base units. UMA's own minimum for the
    ///         currency applies if it is higher (see `effectiveBond`).
    uint256 public bondAmount;

    // --- Assertions ---
    /// @notice Monotonic id of the next assertion.
    uint256 public nextAssertionId;
    mapping(uint256 => BordereauOracle.Assertion) private _assertions;
    mapping(uint256 => mapping(BordereauOracle.AssertionType => uint256)) private _latestFinalized;
    mapping(uint256 => mapping(BordereauOracle.AssertionType => bool)) private _hasFinalized;

    mapping(uint256 => bytes32) private _umaIdOf; // our id -> UMA assertion id
    mapping(bytes32 => uint256) private _idOfUmaPlusOne; // UMA assertion id -> our id + 1 (0 = unknown)
    mapping(uint256 => uint256) private _bondOf; // bond posted on each assertion

    // --- Events ---
    /// @notice An assertion entered its liveness window (same signature as the stand-in).
    event AssertionProposed(
        uint256 indexed assertionId,
        uint256 indexed portfolioId,
        BordereauOracle.AssertionType assertionType,
        bytes32 dataHash,
        uint256 declaredAmount,
        address proposer,
        uint64 livenessDeadline
    );
    /// @notice The bond behind an assertion, and the UMA assertion it opened.
    event AssertionBonded(
        uint256 indexed assertionId, bytes32 indexed umaAssertionId, address indexed asserter, uint256 bond
    );
    /// @notice The assertion was disputed (by the Sentinel through this contract, or by anyone on UMA).
    event AssertionDisputed(uint256 indexed assertionId, address indexed disputer, string reason);
    /// @notice The reason the Sentinel gave when it disputed through this contract.
    event DisputeReasonGiven(uint256 indexed assertionId, address indexed sentinel, string reason);
    /// @notice The assertion stood: it survived the window or UMA ruled it true.
    event AssertionFinalized(
        uint256 indexed assertionId, uint256 indexed portfolioId, BordereauOracle.AssertionType assertionType
    );
    /// @notice UMA ruled the assertion false.
    event AssertionRejected(uint256 indexed assertionId);
    /// @notice UMA settled the assertion.
    event AssertionSettled(
        uint256 indexed assertionId, bytes32 indexed umaAssertionId, bool assertedTruthfully, bool wasDisputed
    );
    /// @notice The liveness window was set (at deployment and by the owner).
    event LivenessUpdated(uint64 liveness);
    /// @notice The bond the protocol asks for was set (at deployment and by the owner).
    event BondAmountUpdated(uint256 bondAmount);

    // --- Errors ---
    /// @notice The caller does not hold the role the function requires.
    error UmaBordereauOracle__UnauthorizedRole(address caller, bytes32 role);
    /// @notice The caller is neither an authorized cedant nor the oracle feed.
    error UmaBordereauOracle__UnauthorizedProposer(address caller);
    /// @notice A cedant tried to assert on a portfolio that is not its own.
    error UmaBordereauOracle__NotPortfolioCedant(uint256 portfolioId, address caller);
    /// @notice A parameter is zero where it must not be, or outside its documented bounds.
    error UmaBordereauOracle__InvalidParams();
    /// @notice The dataset pointer is longer than MAX_DATA_URI_LENGTH.
    error UmaBordereauOracle__DataURITooLong(uint256 length);
    /// @notice No assertion has this id.
    error UmaBordereauOracle__AssertionNotFound(uint256 assertionId);
    /// @notice The assertion is not in a status the action applies to.
    error UmaBordereauOracle__InvalidStatus(uint256 assertionId, BordereauOracle.AssertionStatus status);
    /// @notice The liveness window has not elapsed yet, so the assertion cannot be settled.
    error UmaBordereauOracle__LivenessActive(uint256 assertionId, uint64 livenessDeadline);
    /// @notice The liveness window has elapsed, so the assertion can no longer be disputed.
    error UmaBordereauOracle__LivenessElapsed(uint256 assertionId, uint64 livenessDeadline);
    /// @notice Nothing of this type has been finalized for the portfolio: unverified data is absent.
    error UmaBordereauOracle__NoFinalizedAssertion(uint256 portfolioId, BordereauOracle.AssertionType assertionType);
    /// @notice Only UMA's oracle may call the callbacks.
    error UmaBordereauOracle__NotOracle(address caller);
    /// @notice UMA did not report the dispute back to this contract: nothing was recorded.
    error UmaBordereauOracle__DisputeNotRecorded(uint256 assertionId);
    /// @notice Settling on UMA did not leave the assertion finalized (it was ruled false, or UMA is waiting).
    error UmaBordereauOracle__NotFinalized(uint256 assertionId, BordereauOracle.AssertionStatus status);

    // --- Modifiers ---
    modifier onlyProtocolRole(bytes32 role) {
        if (!protocolRoles.hasRole(role, msg.sender)) {
            revert UmaBordereauOracle__UnauthorizedRole(msg.sender, role);
        }
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != address(oracle)) revert UmaBordereauOracle__NotOracle(msg.sender);
        _;
    }

    /// @param protocolRoles_ ProtocolRoles access manager.
    /// @param portfolioRegistry_ PortfolioRegistry (asserted ids must exist).
    /// @param oracle_ UMA's Optimistic Oracle V3 on this chain.
    /// @param bondCurrency_ The bond currency; UMA must accept it (the constructor asks UMA to
    ///        cache its parameters and reverts if it does not).
    /// @param bondAmount_ The bond the protocol asks for, in base units of `bondCurrency_`.
    constructor(
        address protocolRoles_,
        address portfolioRegistry_,
        address oracle_,
        address bondCurrency_,
        uint256 bondAmount_
    ) {
        if (
            protocolRoles_ == address(0) || portfolioRegistry_ == address(0) || oracle_ == address(0)
                || bondCurrency_ == address(0) || oracle_.code.length == 0 || bondCurrency_.code.length == 0
        ) revert UmaBordereauOracle__InvalidParams();

        protocolRoles = ProtocolRoles(protocolRoles_);
        portfolioRegistry = PortfolioRegistry(portfolioRegistry_);
        oracle = IOptimisticOracleV3(oracle_);
        bondCurrency = IERC20(bondCurrency_);
        maxBond = MAX_BOND_UNITS * (10 ** IERC20Metadata(bondCurrency_).decimals());
        if (bondAmount_ > maxBond) revert UmaBordereauOracle__InvalidParams();

        identifier = IOptimisticOracleV3(oracle_).defaultIdentifier();
        // Fails here, at deployment, if UMA does not accept this currency on this chain.
        IOptimisticOracleV3(oracle_).syncUmaParams(identifier, bondCurrency_);

        liveness = DEFAULT_LIVENESS;
        bondAmount = bondAmount_;
        emit LivenessUpdated(DEFAULT_LIVENESS);
        emit BondAmountUpdated(bondAmount_);
    }

    // --- Configuration (OWNER_ROLE) ---

    /// @notice Update the liveness window within the documented bounds.
    function setLiveness(uint64 liveness_) external onlyProtocolRole(OWNER_ROLE) {
        if (liveness_ < LIVENESS_FLOOR || liveness_ > LIVENESS_CEILING) revert UmaBordereauOracle__InvalidParams();
        liveness = liveness_;
        emit LivenessUpdated(liveness_);
    }

    /// @notice Update the bond the protocol asks for. Applies to assertions made after the change.
    function setBondAmount(uint256 bondAmount_) external onlyProtocolRole(OWNER_ROLE) {
        if (bondAmount_ > maxBond) revert UmaBordereauOracle__InvalidParams();
        bondAmount = bondAmount_;
        emit BondAmountUpdated(bondAmount_);
    }

    /// @notice Ask UMA to refresh what it has cached for the bond currency (its final fee can
    ///         change). Permissionless: it only reads UMA's own parameters.
    function syncUma() external {
        oracle.syncUmaParams(identifier, address(bondCurrency));
    }

    // --- Proposal (cedant or oracle feed) ---

    /// @notice The bond a new assertion would post: the protocol's setting, or UMA's minimum
    ///         for the currency if that is higher.
    function effectiveBond() public view returns (uint256) {
        uint256 floor = oracle.getMinimumBond(address(bondCurrency));
        return bondAmount > floor ? bondAmount : floor;
    }

    /// @notice Propose a bordereau assertion and put the bond behind it. Caller must hold
    ///         AUTHORIZED_CEDANT_ROLE (for its own portfolio) or ORACLE_ROLE, must have
    ///         approved this contract for `effectiveBond()` of the bond currency, and gets
    ///         the bond back if the assertion stands.
    function proposeAssertion(
        uint256 portfolioId,
        BordereauOracle.AssertionType assertionType,
        bytes32 dataHash,
        string calldata dataURI,
        uint256 declaredAmount
    ) external nonReentrant returns (uint256 assertionId) {
        if (dataHash == bytes32(0)) revert UmaBordereauOracle__InvalidParams();
        if (bytes(dataURI).length > MAX_DATA_URI_LENGTH) {
            revert UmaBordereauOracle__DataURITooLong(bytes(dataURI).length);
        }
        _authorizeProposer(portfolioId);
        assertionId = _record(portfolioId, assertionType, dataHash, dataURI, declaredAmount);
        _openOnUma(assertionId);
    }

    // --- Dispute ---

    /// @notice Dispute a proposed assertion by matching its bond. Only SENTINEL_ROLE through
    ///         this function; the Sentinel must have approved this contract for the bond. Anyone
    ///         else can dispute directly on UMA's oracle with the same effect, and this contract
    ///         learns of it through the callback.
    function disputeAssertion(uint256 assertionId, string calldata reason)
        external
        nonReentrant
        onlyProtocolRole(SENTINEL_ROLE)
    {
        BordereauOracle.Assertion storage a = _getAssertion(assertionId);
        if (a.status != BordereauOracle.AssertionStatus.PROPOSED) {
            revert UmaBordereauOracle__InvalidStatus(assertionId, a.status);
        }
        // UMA refuses a dispute at or after expiry.
        if (uint64(block.timestamp) >= a.livenessDeadline) {
            revert UmaBordereauOracle__LivenessElapsed(assertionId, a.livenessDeadline);
        }

        _openBond(msg.sender, _bondOf[assertionId]);
        oracle.disputeAssertion(_umaIdOf[assertionId], msg.sender); // calls assertionDisputedCallback

        // The callback is what records a dispute. If UMA did not make it, nothing was recorded
        // and the bond must not be left stranded here: revert, which returns it.
        if (a.status != BordereauOracle.AssertionStatus.DISPUTED) {
            revert UmaBordereauOracle__DisputeNotRecorded(assertionId);
        }
        emit DisputeReasonGiven(assertionId, msg.sender, reason);
    }

    // --- Finalization (permissionless) ---

    /// @notice Settle an assertion that survived its window. Permissionless housekeeping (the
    ///         claims keeper calls it); UMA returns the bond to the proposer and calls back.
    function finalizeAssertion(uint256 assertionId) external nonReentrant {
        BordereauOracle.Assertion storage a = _getAssertion(assertionId);
        if (a.status != BordereauOracle.AssertionStatus.PROPOSED) {
            revert UmaBordereauOracle__InvalidStatus(assertionId, a.status);
        }
        if (uint64(block.timestamp) < a.livenessDeadline) {
            revert UmaBordereauOracle__LivenessActive(assertionId, a.livenessDeadline);
        }
        oracle.settleAssertion(_umaIdOf[assertionId]); // calls assertionResolvedCallback
        if (a.status != BordereauOracle.AssertionStatus.FINALIZED) {
            revert UmaBordereauOracle__NotFinalized(assertionId, a.status);
        }
    }

    /// @notice Settle a disputed assertion once UMA's oracle has ruled. Permissionless. Reverts
    ///         while UMA has not resolved the dispute.
    function settleDisputed(uint256 assertionId) external nonReentrant {
        BordereauOracle.Assertion storage a = _getAssertion(assertionId);
        if (a.status != BordereauOracle.AssertionStatus.DISPUTED) {
            revert UmaBordereauOracle__InvalidStatus(assertionId, a.status);
        }
        oracle.settleAssertion(_umaIdOf[assertionId]); // calls assertionResolvedCallback
    }

    // --- UMA callbacks ---

    /// @inheritdoc IOptimisticOracleV3CallbackRecipient
    function assertionResolvedCallback(bytes32 umaAssertionId, bool assertedTruthfully) external onlyOracle {
        uint256 plusOne = _idOfUmaPlusOne[umaAssertionId];
        if (plusOne == 0) return; // not ours: ignore, never revert
        uint256 id = plusOne - 1;
        BordereauOracle.Assertion storage a = _assertions[id];
        bool wasDisputed = a.status == BordereauOracle.AssertionStatus.DISPUTED;
        if (a.status != BordereauOracle.AssertionStatus.PROPOSED && !wasDisputed) return; // already settled

        if (assertedTruthfully) {
            _finalize(a);
        } else {
            a.status = BordereauOracle.AssertionStatus.REJECTED;
            emit AssertionRejected(id);
        }
        emit AssertionSettled(id, umaAssertionId, assertedTruthfully, wasDisputed);
    }

    /// @inheritdoc IOptimisticOracleV3CallbackRecipient
    function assertionDisputedCallback(bytes32 umaAssertionId) external onlyOracle {
        uint256 plusOne = _idOfUmaPlusOne[umaAssertionId];
        if (plusOne == 0) return;
        uint256 id = plusOne - 1;
        BordereauOracle.Assertion storage a = _assertions[id];
        if (a.status != BordereauOracle.AssertionStatus.PROPOSED) return;

        a.status = BordereauOracle.AssertionStatus.DISPUTED;
        a.disputer = oracle.getAssertion(umaAssertionId).disputer;
        emit AssertionDisputed(id, a.disputer, "disputed on UMA");
    }

    // --- Views (same surface as BordereauOracle) ---

    /// @notice Full assertion record (reverts when unknown).
    function getAssertion(uint256 assertionId) external view returns (BordereauOracle.Assertion memory) {
        BordereauOracle.Assertion memory a = _assertions[assertionId];
        if (a.proposer == address(0)) revert UmaBordereauOracle__AssertionNotFound(assertionId);
        return a;
    }

    /// @notice Number of assertions ever proposed.
    function getAssertionCount() external view returns (uint256) {
        return nextAssertionId;
    }

    /// @notice True when the assertion reached FINALIZED.
    function isFinalized(uint256 assertionId) external view returns (bool) {
        return _assertions[assertionId].status == BordereauOracle.AssertionStatus.FINALIZED;
    }

    /// @notice Latest finalized assertion for a portfolio/type. Reverts if none: consumers must
    ///         treat unverified bordereau data as absent.
    function latestFinalized(uint256 portfolioId, BordereauOracle.AssertionType assertionType)
        external
        view
        returns (BordereauOracle.Assertion memory)
    {
        if (!_hasFinalized[portfolioId][assertionType]) {
            revert UmaBordereauOracle__NoFinalizedAssertion(portfolioId, assertionType);
        }
        return _assertions[_latestFinalized[portfolioId][assertionType]];
    }

    // --- Views (UMA side) ---

    /// @notice The UMA assertion behind one of ours (zero if unknown).
    function umaAssertionOf(uint256 assertionId) external view returns (bytes32) {
        return _umaIdOf[assertionId];
    }

    /// @notice The bond posted on an assertion, in base units.
    function bondOf(uint256 assertionId) external view returns (uint256) {
        return _bondOf[assertionId];
    }

    // --- Internal ---

    /// @dev Pull a bond from `from` and approve UMA to take it. Nothing stays here: UMA pulls
    ///      exactly this amount in the same transaction.
    function _openBond(address from, uint256 bond) internal {
        if (bond == 0) return;
        bondCurrency.safeTransferFrom(from, address(this), bond);
        bondCurrency.forceApprove(address(oracle), bond);
    }

    function _finalize(BordereauOracle.Assertion storage a) internal {
        a.status = BordereauOracle.AssertionStatus.FINALIZED;
        _latestFinalized[a.portfolioId][a.assertionType] = a.assertionId;
        _hasFinalized[a.portfolioId][a.assertionType] = true;
        emit AssertionFinalized(a.assertionId, a.portfolioId, a.assertionType);
    }

    function _getAssertion(uint256 assertionId) internal view returns (BordereauOracle.Assertion storage a) {
        a = _assertions[assertionId];
        if (a.proposer == address(0)) revert UmaBordereauOracle__AssertionNotFound(assertionId);
    }

    /// @dev The oracle feed speaks for every portfolio; a cedant only for its own (F-12).
    function _authorizeProposer(uint256 portfolioId) internal view {
        // Reverts if the portfolio does not exist.
        PortfolioRegistry.Portfolio memory pf = portfolioRegistry.getPortfolio(portfolioId);
        if (protocolRoles.hasRole(ORACLE_ROLE, msg.sender)) return;
        if (!protocolRoles.hasRole(AUTHORIZED_CEDANT_ROLE, msg.sender)) {
            revert UmaBordereauOracle__UnauthorizedProposer(msg.sender);
        }
        if (pf.cedant != msg.sender) revert UmaBordereauOracle__NotPortfolioCedant(portfolioId, msg.sender);
    }

    /// @dev Write the record before any external call (effects before interactions).
    function _record(
        uint256 portfolioId,
        BordereauOracle.AssertionType assertionType,
        bytes32 dataHash,
        string calldata dataURI,
        uint256 declaredAmount
    ) internal returns (uint256 assertionId) {
        assertionId = nextAssertionId++;
        BordereauOracle.Assertion storage a = _assertions[assertionId];
        a.assertionId = assertionId;
        a.portfolioId = portfolioId;
        a.assertionType = assertionType;
        a.dataHash = dataHash;
        a.dataURI = dataURI;
        a.declaredAmount = declaredAmount;
        a.proposer = msg.sender;
        a.proposedAt = uint64(block.timestamp);
        a.livenessDeadline = uint64(block.timestamp) + liveness;
        a.status = BordereauOracle.AssertionStatus.PROPOSED;
        _bondOf[assertionId] = effectiveBond();

        emit AssertionProposed(
            assertionId, portfolioId, assertionType, dataHash, declaredAmount, msg.sender, a.livenessDeadline
        );
    }

    /// @dev Pull the bond from the proposer and open the UMA assertion.
    function _openOnUma(uint256 assertionId) internal {
        uint256 bond = _bondOf[assertionId];
        _openBond(msg.sender, bond);
        bytes32 umaId = oracle.assertTruth(
            _claim(_assertions[assertionId]),
            msg.sender, // the asserter: the bond comes back to the proposer
            address(this), // callbacks
            address(0), // no escalation manager: UMA's oracle decides disputes
            liveness,
            bondCurrency,
            bond,
            identifier,
            DOMAIN_ID
        );
        _umaIdOf[assertionId] = umaId;
        _idOfUmaPlusOne[umaId] = assertionId + 1;
        emit AssertionBonded(assertionId, umaId, msg.sender, bond);
    }

    /// @dev The statement UMA's voters would read if the assertion were disputed. It names the
    ///      dataset by hash and pointer, the portfolio, the amount, this contract and the asserter,
    ///      and says what the asserter is vouching for.
    function _claim(BordereauOracle.Assertion storage a) internal view returns (bytes memory) {
        bytes memory head = abi.encodePacked(
            "NextBlock bordereau assertion #",
            Strings.toString(a.assertionId),
            " on chain ",
            Strings.toString(block.chainid),
            " (oracle contract ",
            Strings.toHexString(address(this)),
            "): the dataset with keccak256 hash ",
            Strings.toHexString(uint256(a.dataHash), 32),
            " at ",
            a.dataURI
        );
        bytes memory tail = abi.encodePacked(
            " is the true and complete ",
            _typeName(a.assertionType),
            " of portfolio #",
            Strings.toString(a.portfolioId),
            ", declaring ",
            Strings.toString(a.declaredAmount),
            " USDC base units (6 decimals), asserted by ",
            Strings.toHexString(a.proposer),
            "."
        );
        return bytes.concat(head, tail);
    }

    function _typeName(BordereauOracle.AssertionType t) internal pure returns (string memory) {
        if (t == BordereauOracle.AssertionType.PREMIUM_BORDEREAU) return "premium bordereau";
        if (t == BordereauOracle.AssertionType.POLICY_BORDEREAU) return "policy bordereau";
        if (t == BordereauOracle.AssertionType.CLAIMS_BORDEREAU) return "claims bordereau";
        return "dataset";
    }
}
