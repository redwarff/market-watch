import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { readSession } from '@/server/auth';

export const metadata = { title: 'Sign in' };

export default async function LoginPage() {
  if (await readSession()) redirect('/');
  return <LoginForm />;
}
