export interface NavItem {
  label: string;
  href: string;
}

export interface WorkflowStep {
  step: string;
  title: string;
  description: string;
  icon: string;
}

export interface Differentiator {
  title: string;
  description: string;
  icon: string;
}

export interface PortfolioItem {
  title: string;
  type: string;
  image: string;
  className: string;
}

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

export interface PricingPlan {
  name: string;
  price: string;
  description: string;
  features: string[];
  popular?: boolean;
}

export interface FAQItem {
  question: string;
  answer: string;
}
