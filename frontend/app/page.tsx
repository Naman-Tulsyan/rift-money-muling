import CSVUpload from '@/components/CSVUpload'

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto px-4">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Rift Money Muling
          </h1>
          <p className="text-gray-600">
            Upload and validate transaction CSV files
          </p>
        </header>
        
        <CSVUpload />
      </div>
    </div>
  )
}