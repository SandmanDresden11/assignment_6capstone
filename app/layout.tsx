import './globals.css';
import { RoleProvider } from '@/components/RoleBar';

export const metadata = {
  title: 'Hazmat Spill Tracker 2.0',
  description: 'Assignment 6 capstone: AI-Assisted Post-Spill Review and Corrective Action Management.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="max-w-6xl mx-auto p-4">
          <RoleProvider>{children}</RoleProvider>
        </div>
      </body>
    </html>
  );
}
