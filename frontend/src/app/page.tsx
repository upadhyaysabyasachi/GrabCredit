import Link from "next/link";

const surfaces = [
  {
    title: "Scenario Simulator",
    description:
      "Test all 11 demo scenarios end-to-end. Select users, merchants, cart values, and partner behaviors to see full eligibility decisions, checkout flows, and state transitions.",
    href: "/simulator",
    icon: (
      <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    title: "Consumer Checkout",
    description:
      "Experience the BNPL checkout flow from a consumer perspective. Browse deals, check eligibility, view EMI terms, and complete checkout with real-time status updates.",
    href: "/checkout",
    icon: (
      <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 0 0-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 0 0-16.536-1.84M7.5 14.25 5.106 5.272M6 20.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Zm12.75 0a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z" />
      </svg>
    ),
  },
  {
    title: "Operator Dashboard",
    description:
      "Monitor eligibility decisions, checkout statuses, and webhook callback logs. Track approval rates, failure patterns, and duplicate callbacks in real time.",
    href: "/dashboard",
    icon: (
      <svg className="w-8 h-8 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center">
          <h1 className="text-4xl font-bold text-gray-900 sm:text-5xl">
            Grab<span className="text-indigo-600">Credit</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Buy Now, Pay Later eligibility and checkout system for GrabOn&apos;s deal
            platform. Real-time credit decisioning, partner integration, and
            operational monitoring in one prototype.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3 text-sm text-gray-500">
            <span className="px-2.5 py-0.5 bg-gray-100 rounded-full font-medium">FastAPI</span>
            <span className="px-2.5 py-0.5 bg-gray-100 rounded-full font-medium">Next.js</span>
            <span className="px-2.5 py-0.5 bg-gray-100 rounded-full font-medium">Supabase</span>
            <span className="px-2.5 py-0.5 bg-gray-100 rounded-full font-medium">MCP</span>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid gap-8 md:grid-cols-3">
          {surfaces.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="group block bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all"
            >
              <div className="mb-4">{s.icon}</div>
              <h2 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors">
                {s.title}
              </h2>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                {s.description}
              </p>
              <span className="mt-4 inline-flex items-center text-sm font-medium text-indigo-600">
                Open
                <svg className="ml-1 w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
