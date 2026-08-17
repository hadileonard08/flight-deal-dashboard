export const dynamic = 'force-dynamic';

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">We are updating</h1>
        <p className="text-gray-600">
          The site is temporarily down for improvements. Please check back in a few minutes.
        </p>
      </div>
    </div>
  );
}
