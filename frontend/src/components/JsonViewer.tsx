"use client";

import { useState } from "react";

export default function JsonViewer({
  data,
  title = "Raw JSON",
}: {
  data: unknown;
  title?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span>{title}</span>
        <span className="text-gray-400">{isOpen ? "Hide" : "Show"}</span>
      </button>
      {isOpen && (
        <pre className="px-4 py-3 bg-gray-900 text-green-400 text-xs overflow-x-auto rounded-b-lg max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
