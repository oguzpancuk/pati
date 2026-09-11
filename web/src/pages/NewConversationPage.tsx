import { PageHeader } from '../components/PageHeader';
import { NewConversationForm } from '../components/NewConversationForm';

/**
 * The route behind /mesajlar/yeni. The inbox opens the same form in a dialog;
 * this stays so a link, a bookmark or a cold start still land somewhere.
 */
export default function NewConversationPage() {
  return (
    <div className="page">
      <PageHeader title="yeni sohbet" fallback="/mesajlar" />
      <NewConversationForm />
    </div>
  );
}
