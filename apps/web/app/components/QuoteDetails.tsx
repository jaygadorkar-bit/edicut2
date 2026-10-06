import { quoteBudgets, quoteCadences, quoteDurations, quoteFootage, quotePlatforms, quoteProjectTypes, quoteRatios, quoteRequestTypes, quoteRevisions, quoteServices, quoteStyles, quoteUrgencies, quoteOptionLabel, type CustomQuoteOptions } from "@edicut/shared/contracts/custom-quotes";
import { ExternalLink } from "lucide-react";

export function QuoteDetails({ options }: { options: CustomQuoteOptions }) {
  const fields = [
    ["Project type", quoteOptionLabel(quoteProjectTypes, options.projectType)], ["Request type", quoteOptionLabel(quoteRequestTypes, options.requestType)],
    ["Video count", `${options.videoCount}${options.requestType === "recurring" ? " per delivery cycle" : " total"}`], ["Delivery schedule", quoteOptionLabel(quoteCadences, options.cadence)],
    ["Finished length", quoteOptionLabel(quoteDurations, options.duration)], ["Raw footage", quoteOptionLabel(quoteFootage, options.footage)],
    ["Platforms", options.platforms.map(value => quoteOptionLabel(quotePlatforms, value)).join(", ")], ["Video formats", options.aspectRatios.map(value => quoteOptionLabel(quoteRatios, value)).join(", ")],
    ["Editing style", quoteOptionLabel(quoteStyles, options.style)], ["Revisions", quoteOptionLabel(quoteRevisions, options.revisions)],
    ["Turnaround", quoteOptionLabel(quoteUrgencies, options.urgency)], ["Preferred delivery date", options.deadline || "Flexible"],
    ["Budget (USD)", quoteOptionLabel(quoteBudgets, options.budget)], ["Languages", options.languages || "Not specified"],
  ];
  const links = [["Channel / brand", options.channelUrl], ["Footage", options.footageUrl], ...options.referenceUrls.split(/\r?\n/).map((link, index) => [`Reference ${index + 1}`, link.trim()])].filter(([, url]) => !!url);
  return <div className="quote-detail-body">
    <dl className="quote-detail-grid">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="quote-detail-block"><h4>Requested services</h4><div className="quote-service-tags">{options.services.map(value => <span key={value}>{quoteOptionLabel(quoteServices, value)}</span>)}</div></div>
    <div className="quote-detail-block"><h4>Customer brief</h4><p className="quote-brief-text">{options.brief}</p></div>
    {links.length ? <div className="quote-detail-block"><h4>Shared links</h4><ul className="quote-shared-links">{links.map(([label, url], index) => <li key={index}><span>{label}</span><a href={url} target="_blank" rel="noopener noreferrer nofollow">{url}<ExternalLink size={14} aria-hidden="true" /></a></li>)}</ul></div> : null}
  </div>;
}
