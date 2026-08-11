import './globals.css';
import { RoleProvider } from '@/components/RoleBar';

export const metadata = {
  title: 'Hazmat Spill Response Tracker',
  description: 'Assignment 5B build of the Assignment 5A Hazmat Spill Response Tracker design.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="max-w-5xl mx-auto p-4">
          <RoleProvider>{children}</RoleProvider>
        </div>
      </body>
    </html>
  );
}
