import { TERMS_MD } from '../legal';
import { LegalPage } from './PrivacyPage';

/** The terms of use at /kosullar — public, linked from the register form. */
export default function TermsPage() {
  return (
    <LegalPage
      md={TERMS_MD}
      micro="kullanım koşulları"
      crossTo="/gizlilik"
      crossLabel="aydınlatma metni"
    />
  );
}
