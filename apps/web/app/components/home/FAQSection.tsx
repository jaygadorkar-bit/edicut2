import { faqs } from "./data";
import { FaqSection } from "../site/FaqSection";

export function FAQSection() {
  return <FaqSection id="faq" items={faqs} />;
}
