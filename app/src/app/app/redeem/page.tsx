import { redirect } from 'next/navigation';

/** Withdrawals moved into Portfolio: exiting is an action on a position. */
export default function RedeemRedirect() {
  redirect('/app/portfolio');
}
