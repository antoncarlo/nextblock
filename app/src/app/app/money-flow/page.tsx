import { redirect } from 'next/navigation';

/** Money Flow became Transparency (protocol-wide, not single-vault). */
export default function MoneyFlowRedirect() {
  redirect('/app/transparency');
}
