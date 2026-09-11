/**
 * The two password surfaces. ForgotPasswordDialog sits on the login page;
 * ChangePasswordForm is self-contained so the profile's settings sheet can
 * mount it (ProfilePage passes `me` and the reload).
 */
export { ForgotPasswordDialog } from './ForgotPasswordDialog';
export { ChangePasswordForm } from './ChangePasswordForm';
