import type { MetaFunction } from "react-router";
import { Header } from "../components/home/Header";
import { Footer } from "../components/home/Footer";
import { useState } from "react";

export const meta: MetaFunction = () => {
  return [
    { title: "FAQ - EdiCut" },
    { name: "description", content: "Frequently asked questions about EdiCut" },
  ];
};

const categories = ["General", "Pricing", "Workflow", "Security"];

const allFaqs = [
  {
    category: "Workflow",
    question: "What is EdiCut's automated workflow?",
    answer: "EdiCut uses advanced AI to analyze your raw footage, identifying key moments, speech patterns, and visual transitions. It then assembles a rough cut based on your selected style profile, saving you hours of manual sorting."
  },
  {
    category: "General",
    question: "How long does a typical export take?",
    answer: "Export times depend on the length and resolution of your video. For a standard 1080p 10-minute video, expect roughly 3-5 minutes on our cloud servers. 4K exports will take longer."
  },
  {
    category: "Pricing",
    question: "Is there a limit on cloud storage?",
    answer: "Free plans include 5GB of cloud storage. Pro plans offer 100GB, and Enterprise plans have unlimited storage for active projects."
  },
  {
    category: "Security",
    question: "How secure is my unreleased footage?",
    answer: "We use enterprise-grade end-to-end encryption for all uploads and storage. We never use your private unreleased footage to train our public models without explicit opt-in."
  }
];

export default function FAQ() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const filteredFaqs = allFaqs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchQuery.toLowerCase()) || faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === "All" || faq.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <Header />
      
      <main className="pt-32 pb-24 px-5 max-w-3xl mx-auto min-h-screen">
        <section className="mb-12 text-center md:text-left">
          <h1 className="text-4xl font-black uppercase tracking-tight text-black mb-4">How can we help?</h1>
          <p className="text-lg text-gray-500 mb-8 font-medium">Search our knowledge base or browse categories below.</p>
          
          <div className="relative group max-w-xl">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-red-600 transition-colors">
              search
            </span>
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-14 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-full focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all text-base outline-none" 
              placeholder="Search questions..." 
              type="text"
            />
          </div>
        </section>

        <section className="mb-12 overflow-x-auto no-scrollbar flex gap-2 flex-wrap">
          <button 
            onClick={() => setActiveCategory("All")}
            className={`px-5 py-2 rounded-full font-bold text-sm transition-colors ${activeCategory === "All" ? "bg-red-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            All
          </button>
          {categories.map(category => (
            <button 
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`px-5 py-2 rounded-full font-bold text-sm transition-colors ${activeCategory === category ? "bg-red-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {category}
            </button>
          ))}
        </section>

        <section className="space-y-4 max-w-2xl">
          {filteredFaqs.length > 0 ? (
            filteredFaqs.map((faq, index) => (
              <div key={index} className="border-b border-gray-100 pb-4">
                <details className="group [&_summary::-webkit-details-marker]:hidden" open={index === 0}>
                  <summary className="flex justify-between items-center cursor-pointer list-none py-2">
                    <span className="text-lg font-bold text-black group-open:text-red-600 transition-colors pr-4">
                      {faq.question}
                    </span>
                    <span className="material-symbols-outlined text-gray-400 group-open:rotate-180 transition-transform">
                      expand_more
                    </span>
                  </summary>
                  <div className="mt-3 text-base text-gray-500 leading-relaxed font-medium">
                    {faq.answer}
                  </div>
                </details>
              </div>
            ))
          ) : (
            <div className="py-10 text-center text-gray-500">
              No results found for "{searchQuery}".
            </div>
          )}
        </section>
      </main>
      
      <Footer />
    </div>
  );
}
