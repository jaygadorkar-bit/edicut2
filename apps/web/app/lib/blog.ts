export type BlogSection = { id: string; title: string; paragraphs: string[]; bullets?: string[] };
export type BlogFaq = { question: string; answer: string };
export type BlogPost = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  excerpt: string;
  category: string;
  primaryKeyword: string;
  publishedAt: string;
  author: string;
  coverImage: string;
  coverAlt: string;
  /** Raster fallback for social platforms that do not render SVG previews. */
  socialImage: string;
  serviceLink?: { to: string; label: string };
  sources?: { label: string; url: string }[];
  intro: string[];
  sections: BlogSection[];
  faqs: BlogFaq[];
  takeaway: string;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "how-to-choose-youtube-video-editing-service",
    title: "How to Choose a YouTube Video Editing Service",
    seoTitle: "How to Choose a YouTube Video Editing Service | EdiCut",
    description: "Compare YouTube video editing services by portfolio, scope, revisions, and review workflow. Use EdiCut’s checklist to choose an editor for your channel.",
    excerpt: "Find an editor who fits your channel, your brief, and the way you like to work.",
    category: "Creator workflow",
    primaryKeyword: "how to choose a YouTube video editing service",
    publishedAt: "2026-10-22",
    author: "EdiCut editorial team",
    coverImage: "/images/blog/choose-editing-partner-1280.webp",
    coverAlt: "A creator’s video edit beside a selected editor profile and a review checkmark",
    socialImage: "/images/blog/choose-editing-partner.webp",
    intro: [
      "Choosing a YouTube video editing service is less about finding the fanciest effects and more about finding a partner who understands the job your next video needs to do. A tutorial needs clear steps; a review needs evidence and a fair comparison; a vlog needs enough connective tissue to feel like a story. The right fit can make the work easier to hand off without taking the editorial decisions away from you.",
      "Use the checks below to compare services before you send footage or commit to a package. The questions apply whether you hire a freelance editor or work with a team such as [EdiCut’s YouTube editing service](/services/youtube-video-editing)."
    ],
    sections: [
      { id: "start-with-the-job", title: "Start with the job the edit must do", paragraphs: [
        "Write one sentence about the viewer and the value of the video: “A first-time home baker should be able to follow this recipe without guessing,” or “A new camera buyer should understand the trade-offs before comparing models.” This gives an editor a useful north star. “Make it engaging” describes a hope, not an editing decision.",
        "Then note the format and the material available. Is the recording a single talking-head take, a two-camera conversation, screen capture with narration, or a vlog assembled from many clips? Does the editor need to find the strongest moments in a long recording, or will you provide selects and timestamps? These are different amounts and kinds of work. An editor should understand them before quoting or confirming scope."
      ]},
      { id: "inspect-relevant-work", title: "Inspect relevant work, not just a highlight reel", paragraphs: [
        "Look for examples close to your format and editing needs. Watch enough of each example to see how the editor handles the opening, transitions between ideas, quiet moments, audio changes, and the ending. A fast montage can demonstrate visual taste, but it may not show whether the person can organize a ten-minute explanation or preserve a natural conversation.",
        "Ask what part of a sample the service produced and whether the example reflects the style you are discussing. If a portfolio uses reference examples, treat them as prompts for discussing direction rather than proof of that service’s own work. EdiCut’s [portfolio](/portfolio) currently presents credited reference examples; ask the team whether they can share EdiCut-produced work relevant to your format."
      ], bullets: [
        "Does the opening establish the subject without promising something the video cannot deliver?",
        "Can you follow the argument or sequence without needing to rewind for missing context?",
        "Do graphics, captions, music, and effects support the point, or compete with it?",
        "Does the pacing suit this subject, rather than copying a style from an unrelated genre?"
      ]},
      { id: "discuss-retention", title: "Discuss viewer attention with specific examples", paragraphs: [
        "An editor can make more useful suggestions when you describe where a video becomes hard to follow. Our [YouTube audience retention editing checklist](/blog/youtube-audience-retention-editing-checklist) shows how to turn viewing patterns and your own observations into clear revision notes, without treating every dip as a reason to add more effects."
      ]},
      { id: "compare-scope", title: "Compare scope line by line", paragraphs: [
        "A headline price has little meaning without a defined workload. Compare the maximum raw-footage length, target finished length, included deliverables, revision rounds, expected timing, and any limits on graphics, captions, sound work, or sourcing. Clarify who supplies music, B-roll, logos, and other assets, and who checks usage rights. Ask how add-ons or work beyond the agreed limits are handled.",
        "Check whether the quote covers one upload or a recurring plan, and how much editing time a monthly arrangement reserves. Do not assume a thumbnail, vertical cutdown, transcript, source project, or alternate version is included. EdiCut lists current package scope on its [pricing page](/pricing); the team confirms footage limits, finished length, treatment, schedule, and revisions before work begins."
      ]},
      { id: "feedback-workflow", title: "Check the feedback workflow", paragraphs: [
        "A useful process gives both sides a place to resolve specific decisions. Ask how footage is shared, where you watch the first cut, how you leave timestamped notes, and how the editor confirms which revision requests are in scope. Learn whether one person collects feedback from collaborators. Conflicting notes from several reviewers can send an edit in circles, so appoint a final decision-maker on your side.",
        "Before work starts, agree what counts as a revision. Correcting an edit against the brief differs from changing the concept, replacing supplied footage, or adding a new deliverable. The [editing brief checklist](/blog/youtube-video-editing-brief-checklist) can help you gather direction, must-keep moments, and review notes in one place."
      ]},
      { id: "make-a-small-decision", title: "Make the decision on a real project", paragraphs: [
        "If you are still unsure, use a clearly scoped first project as a working test. Send representative footage, a concise brief, and references that show what you like and dislike. Evaluate how the service interprets the goal, communicates questions, and handles the review, along with the final craft. Avoid asking for extensive unpaid work as a test; a short paid project with clear deliverables is more informative and respectful.",
        "For EdiCut, the stated workflow is to choose a suitable package, share the footage and references, agree on limits and schedule, then review the first cut in the project workspace. You can [contact the team](/contact) with your format, footage duration, desired finished length, upload cadence, and any unusual requirements to discuss fit before proceeding. If you also plan to publish cutdowns, see [how to repurpose a YouTube video into Shorts](/blog/repurpose-youtube-videos-into-shorts) before deciding whether that work belongs in the same brief.",
        "For a closer look at our managed service, editorial review, and package choices, read [3 reasons why you should hire EdiCut](/blog/3-reasons-why-you-should-hire-edicut)."
      ], bullets: [
        "Format and intended viewer",
        "Raw-footage duration and expected finished length",
        "Links to two or three style references, with notes on what to borrow",
        "Must-keep details, sensitive material, and anything to exclude",
        "Deliverables, target date, and your revision expectations"
      ]}
    ],
    faqs: [
      { question: "What should I ask before hiring a YouTube editor?", answer: "Ask for relevant examples and clarify raw-footage limits, finished length, deliverables, revisions, timing, asset responsibilities, and how feedback is collected." },
      { question: "Should I choose a freelancer or an editing service?", answer: "Choose based on the work and communication setup you need. Compare the actual editor or team workflow, availability, scope, and how continuity is handled rather than assuming one model always fits better." },
      { question: "Does a portfolio guarantee the same result for my channel?", answer: "No. EdiCut’s portfolio currently presents credited reference examples, not proof of EdiCut-produced work. Use them to discuss direction, and ask the team whether they can share relevant work. Your footage, brief, scope, and review decisions also shape the result." },
      { question: "Are Shorts and thumbnails normally included?", answer: "They may be separate deliverables. Confirm whether each is included, what versions are supplied, and whether additional scope affects price or schedule." }
    ],
    takeaway: "Choose an editor by matching the real work, agreeing on scope before editing, and making sure the feedback process gives you a clear way to review the result."
  },
  {
    slug: "youtube-video-editing-brief-checklist",
    title: "The YouTube Video Editing Brief Checklist (With a Sample Brief)",
    seoTitle: "YouTube Video Editing Brief Checklist + Sample | EdiCut",
    description: "Use EdiCut’s YouTube video editing brief checklist and sample to share your audience, footage, style references, deliverables, and clear revision notes.",
    excerpt: "Give your editor a clear plan with a practical checklist and a ready-to-use sample brief.",
    category: "Production planning",
    primaryKeyword: "YouTube video editing brief checklist",
    publishedAt: "2026-10-22",
    author: "EdiCut editorial team",
    coverImage: "/images/blog/video-brief-checklist-1280.webp",
    coverAlt: "An illustrated video brief with checked goal, footage, and deliverables, a pencil, and a clapperboard",
    socialImage: "/images/blog/video-brief-checklist.webp",
    intro: [
      "A good YouTube video editing brief does not prescribe every cut. It gives the editor enough context to make useful decisions and tells them which decisions belong to you. Without that context, “tighten this up” can mean removing pauses to one person and changing the structure to another.",
      "Use this checklist before transferring footage. It works for a freelancer or a service such as [EdiCut](/services/youtube-video-editing), where the team agrees footage limits, finished length, visual treatment, schedule, and revisions before editing begins."
    ],
    sections: [
      { id: "brief-outcome", title: "1. State the outcome and viewer", paragraphs: [
        "Start with the topic, intended viewer, and the one thing that viewer should understand, feel, or be able to do by the end. If the video answers a question, write the question plainly. If it tells a story, say what changes between the beginning and ending. This context helps the editor recognize which details build the central idea and which are digressions.",
        "Include a working title or promise if you have one, but flag it as provisional. The edit should support the content the footage can actually deliver. If the title implies a test, for instance, the video needs enough context to show what was tested and what the result means."
      ]},
      { id: "inventory", title: "2. Inventory the material", paragraphs: [
        "List the files and explain how they relate. Mention total recording duration, camera or audio tracks, screen recordings, B-roll, graphics, script, and any existing selects. A folder with “final-final-2” filenames makes an editor guess which take you mean. Use consistent names or a short file list, and identify the preferred version where there are duplicates.",
        "Call out missing pieces early: a product close-up you plan to record later, a graphic still being approved, or a section where the audio is unclear. Share files through a method with the appropriate access permissions. If the editor needs to find highlights in a long recording, say so explicitly; locating moments is part of the task, not an invisible extra.",
        "For interviews with several cameras or separate microphones, use our [video podcast editing checklist](/blog/video-podcast-editing-checklist) to document sync points, speaker tracks, and the full-episode handoff."
      ], bullets: [
        "Total raw-footage duration and desired finished length",
        "Camera, microphone, screen-recording, or game-audio tracks",
        "Scripts, outlines, B-roll, logos, and supplied graphics",
        "Preferred takes, known technical issues, and outstanding assets"
      ]},
      { id: "story-direction", title: "3. Separate must-keep facts from preferences", paragraphs: [
        "Mark names, claims, steps, safety information, legal language, and key conclusions that must remain accurate. Identify spoilers, private details, mistakes that must be removed, and moments that can be shortened. If you provide a script, explain whether the editor may rearrange sentences or only trim within sections.",
        "Then describe style in observable terms: “keep the host on screen while explaining the result,” “use captions only for technical terms,” or “leave a beat after the punchline.” Avoid vague superlatives without examples. A channel reference is most useful when you timestamp a moment and say what the editor should learn from it."
      ]},
      { id: "deliverables", title: "4. Specify the handoff", paragraphs: [
        "List the output you expect: a single horizontal video, a particular file format if required, captions, a separate vertical cut, or other agreed work. Say whether there is a target upload date and when materials will be ready. Confirm scope, footage limits, delivery timing, revision rounds, and any add-ons with the editor before production; package details vary and should be checked against current terms.",
        "If you want a Short from the finished video, identify it now rather than hoping it appears as an automatic extra. The companion guide on [repurposing a YouTube video into Shorts](/blog/repurpose-youtube-videos-into-shorts) explains why selecting a standalone idea comes before choosing a crop. For choosing the right partner and comparing package scope, see [how to choose a YouTube video editing service](/blog/how-to-choose-youtube-video-editing-service)."
      ]},
      { id: "sample", title: "5. Sample brief you can adapt", paragraphs: [
        "The example below is intentionally compact. Replace the bracketed details, attach the footage inventory, and link the references. It tells an editor the purpose and boundaries while leaving room for craft decisions. If you have not chosen who will edit it yet, use this brief when comparing options in [our guide to choosing a YouTube video editing service](/blog/how-to-choose-youtube-video-editing-service)."
      ], bullets: [
        "Project: [working title] — [tutorial / review / commentary / vlog]",
        "Viewer and outcome: [who it is for] should [understand or do what] by the end.",
        "Footage: [total duration], [camera/audio tracks], [script or outline], [B-roll/assets]. Preferred takes: [file names or timestamps].",
        "Must keep: [facts, steps, moments]. Cut or protect: [mistakes, private details, spoilers].",
        "Style: [reference link + timestamp] because [specific quality]. Please avoid [specific treatment].",
        "Deliverables and timing: [agreed video/version], materials ready [date], target review [date]. Confirm package limits and schedule before starting.",
        "Review owner: [one person]. Please flag any unclear claims or missing footage before locking the cut."
      ]},
      { id: "review-notes", title: "6. Give useful notes on the first cut", paragraphs: [
        "Watch the full cut before sending detailed notes. First judge the overall story: does it make sense, does the opening match the rest, and is anything important missing? Then send concise timestamped feedback. Describe the effect you want and the reason; where possible, suggest a direction without insisting on a frame-by-frame solution.",
        "For example, “At 02:14, the result appears before we see the setup. Could we move the setup earlier so the comparison is understandable?” is easier to act on than “This part feels weird.” Group related notes and ask collaborators to consolidate their feedback. This keeps a revision round focused and helps distinguish corrections from a new creative direction.",
        "If a previous upload lost viewers during a similar explanation, add that context to the brief. The [audience retention editing checklist](/blog/youtube-audience-retention-editing-checklist) explains how to review the moment and suggest a focused change."
      ]}
    ],
    faqs: [
      { question: "How long should an editing brief be?", answer: "Long enough to identify the viewer, central message, footage, must-keep details, style references, deliverables, and timing. A concise brief with specific examples is more useful than pages of vague adjectives." },
      { question: "Do I need a finished script?", answer: "No. A script, outline, or short description of the intended story can all provide context. State whether the editor can rearrange material or should preserve a fixed sequence." },
      { question: "How should I share style references?", answer: "Link to a relevant example and point to a timestamp, then explain the specific pacing, sound, captions, or visual treatment you want considered." },
      { question: "Can I add deliverables after editing starts?", answer: "Ask the editor to confirm the impact on scope, price, and timing. A new format or cutdown can require additional work, so include likely versions in the original discussion." }
    ],
    takeaway: "A strong brief makes the audience, purpose, boundaries, footage, and review owner clear. That gives an editor direction without asking them to guess what matters."
  },
  {
    slug: "repurpose-youtube-videos-into-shorts",
    title: "How to Repurpose a YouTube Video Into Shorts That Stand Alone",
    seoTitle: "How to Repurpose YouTube Videos Into Shorts | EdiCut",
    description: "Learn how to repurpose YouTube videos into Shorts: select a complete idea, reframe for vertical viewing, check captions, and plan the edit with EdiCut.",
    excerpt: "Turn one long video into focused Shorts with a complete idea, clear framing, and purpose.",
    category: "Short-form editing",
    primaryKeyword: "repurpose YouTube videos into Shorts",
    publishedAt: "2026-10-22",
    author: "EdiCut editorial team",
    coverImage: "/images/blog/creator-video-to-shorts-1280.webp",
    coverAlt: "A horizontal creator video reframed into two vertical Shorts with individual crops and captions",
    socialImage: "/images/blog/creator-video-to-shorts.webp",
    intro: [
      "Repurposing a YouTube video into Shorts is editorial work before it is formatting work. A vertical frame cannot supply missing setup when a clip starts halfway through a thought. Choose a source moment with a small, understandable arc.",
      "This guide walks through finding that moment, adapting its context, and checking the vertical cut. If you are commissioning the edit, discuss short-form cutdowns as their own scope with an editor such as [EdiCut](/services/short-form-video-editing); they are not automatically included with every long-form edit."
      ] ,
    sections: [
      { id: "find-idea", title: "Find a complete idea, not just a loud moment", paragraphs: [
        "Rewatch the long video with a simple question: which moments would still make sense to someone who has not seen the rest? Look for a compact explanation, a before-and-after, one surprising but supportable observation, a clear answer, or a story beat with its own setup and payoff. A strong reaction may be attention-grabbing, but if the viewer cannot understand what caused it, the clip needs context or a different selection.",
        "For each candidate, write the idea in one sentence. Then note the minimum setup required, the key moment, and the payoff or conclusion. If the setup consumes the entire clip or the ending depends on a later section, it may not be a good candidate. You can use a rough transcript or timestamps to shortlist moments, but watch each candidate in context before cutting it."
      ], bullets: [
        "What question or problem does this clip answer?",
        "What information must the viewer know first?",
        "Where does the idea resolve, and does the clip end there?",
        "Does the clip represent the source fairly without changing its meaning?"
      ]},
      { id: "rebuild-context", title: "Rebuild enough context to make it understandable", paragraphs: [
        "A clip can be true and still be confusing outside its original sequence. Pronouns, references to earlier examples, or conclusions that depend on a comparison may leave a new viewer behind. Add setup only when it accurately reflects the source; do not turn a qualified opinion into a universal claim.",
        "Start close to the useful moment, but preserve the words that establish the subject. Remove distracting pauses and repetition while leaving breathing room. If the thought needs a long explanation, choose another moment or make a separate piece with new narration.",
        "Working from an interview? The [video podcast editing checklist](/blog/video-podcast-editing-checklist) helps you prepare the complete conversation and plan clips as separate deliverables, while keeping the guest’s meaning intact."
      ]},
      { id: "vertical-frame", title: "Reframe the picture for vertical viewing", paragraphs: [
        "A center crop is a starting point, not a finished decision. Keep the active speaker or key object visible. In a conversation, a static crop may hide the listener whose reaction gives the moment meaning; in a demonstration, it may cut off the hands or product. When subjects move, review the full sequence for framing changes rather than checking only the first frame.",
        "If the source includes a wide shot, screen recording, or several important elements, decide what deserves attention at each beat. You might use a readable close crop, alternate between a face and a demonstration, or retain a clean inset when the full screen matters. Avoid shrinking the important material until it becomes unreadable. Captions should be checked for line breaks, names, technical terms, and safe placement where platform controls do not obscure them."
      ]},
      { id: "sound-and-graphics", title: "Use sound and graphics to clarify", paragraphs: [
        "Dialogue should remain intelligible on a small phone speaker. Listen for changes between source clips, distracting background sound, and music that competes with speech. If you add captions, treat them as support for comprehension, not a substitute for clear audio. Keep effects and graphic emphasis proportional to the content and the channel’s style.",
        "A Short can feel fast without cutting every pause; a beat before a reveal or after a joke can help the idea land. Check captions and graphics on a phone-sized preview, and keep claims consistent with the source."
      ]},
      { id: "adapt-opening-ending", title: "Give the clip its own opening and ending", paragraphs: [
        "The first seconds should tell viewers what they are watching or set up a question the clip answers. That does not require a dramatic promise. A direct sentence such as “Here is why the smaller lens changed this shot” can give a viewer a useful reason to stay, provided the clip follows through.",
        "End on the resolution, not on an accidental mid-sentence cutoff. If you add a call to action, make it fit the clip and leave time to understand it. A teaser toward the full video can help when the long version offers relevant detail, but the Short should still deliver a complete piece of value by itself."
      ]},
      { id: "review-short", title: "Review the Short as a new piece", paragraphs: [
        "Do a first watch without pausing. Can a viewer unfamiliar with the source explain the point? Then inspect the opening, crop, captions, sound, and ending separately. Finally compare the cut to its source to make sure the edit has not removed a qualification or changed the order in a misleading way.",
        "When sharing work with an editor, supply the source timestamp, the intended standalone idea, any required context, the desired platform version, and your style references. The [video editing brief checklist](/blog/youtube-video-editing-brief-checklist) has a sample format you can adapt. For a broader comparison of editors, read [how to choose a YouTube video editing service](/blog/how-to-choose-youtube-video-editing-service). EdiCut’s process is to agree on deliverables and scope before work begins, then review the cut and leave timestamped feedback in the project workspace."
      ], bullets: [
        "The clip makes sense without the long video",
        "The first frame and opening establish a clear subject",
        "Important faces, objects, and on-screen details stay visible",
        "Captions and graphics are accurate and readable on a phone",
        "The final words complete the thought and preserve the source meaning",
        "The requested aspect ratio, duration, and deliverables match the agreed brief"
      ]}
    ],
    faqs: [
      { question: "Can any part of a long YouTube video become a Short?", answer: "Not every passage works out of context. Choose a moment with a clear idea, enough setup to understand it, and a real resolution; otherwise select another moment or add accurate context." },
      { question: "Is cropping a horizontal video enough?", answer: "Usually it needs a framing review. Keep the active speaker or important object visible throughout, and check demonstrations, movement, captions, and screen content in the vertical frame." },
      { question: "Should I add captions to every Short?", answer: "Captions can help viewers follow speech, but they should be accurate, readable, and placed where they do not cover important visuals. Confirm the desired caption treatment in the project scope." },
      { question: "Are Shorts included with a long-form editing package?", answer: "Short-form cutdowns have their own scope. Check the current [pricing options](/pricing) or ask [EdiCut](/contact) to confirm deliverables before editing begins." }
    ],
    takeaway: "Treat every Short as a miniature story: select a complete source idea, restore the context it needs, reframe deliberately, and review it on its own terms.",
    sources: [
      { label: "YouTube Help: Upload YouTube Shorts", url: "https://support.google.com/youtube/answer/12779649?hl=en" },
      { label: "YouTube Help: Shorts upload tips", url: "https://support.google.com/youtube/answer/12921536?hl=en" }
    ]
  },
  {
    slug: "3-reasons-why-you-should-hire-edicut",
    title: "3 reasons why you should hire EdiCut",
    seoTitle: "EdiCut Video Editing: 3 Reasons for Creators",
    description: "Explore EdiCut’s video editing service: project management, thoughtful craft with human review, and clear single-video or monthly packages for YouTube creators.",
    excerpt: "Meet the people, process, and package choices behind a smoother editing workflow.",
    category: "Inside EdiCut",
    primaryKeyword: "EdiCut video editing service",
    publishedAt: "2026-10-22",
    author: "EdiCut editorial team",
    coverImage: "/images/blog/edicut-editing-team-1280.webp",
    coverAlt: "EdiCut’s editing team with a project manager, studio review, and clearly scoped packages",
    socialImage: "/images/blog/edicut-editing-team.webp",
    intro: [
      "Making a video takes more than the hours spent recording. Footage still needs a clear brief, a considered edit, and a review process that gets it ready to publish. EdiCut gives YouTube creators a managed way to handle that work, with options for a single video or ongoing monthly editing time.",
      "Here are three practical reasons to consider [EdiCut’s video editing service for YouTube creators](/services/youtube-video-editing): one team coordinates the work, editors bring care to the cut, and package details make it easier to choose a suitable scope."
    ],
    sections: [
      { id: "one-managed-service", title: "1. One managed editing service keeps the work moving", paragraphs: [
        "Hiring an editor should take editing off your plate without leaving you to coordinate a scattered chain of people and messages. At EdiCut, a dedicated project manager helps carry work from the brief through communication and review, while an editor focuses on shaping the video. You stay involved in creative direction without organizing every handoff yourself.",
        "Share your footage, brand assets, and style references through the project dashboard. Use the workspace to follow progress, communicate with your team, review edits, leave timestamped feedback, and download finished videos. A primary editor can learn your channel’s style over time, with a shared style guide helping studio coverage stay consistent when needed."
      ]},
      { id: "editorial-craft", title: "2. The edit gets attention from brief to final review", paragraphs: [
        "Good editing is a series of choices that help viewers follow the idea. An experienced editor looks beyond removing pauses: they consider story, pacing, and how picture and sound can support the moment. The right treatment depends on the footage and format, with storytelling, captions, color, and sound serving the video instead of adding effects for their own sake.",
        "A studio review gives the team a chance to check the edit before sharing a draft, and your feedback lets the editor refine it against your direction. EdiCut also researches new editing tools, including AI-assisted options, and considers where they can help. People guide creative decisions and review the work; a tool is useful only when it serves the agreed edit."
      ]},
      { id: "clear-pricing", title: "3. Clear pricing lets you choose the scope that fits", paragraphs: [
        "Editing needs vary. You might have one finished video ready for a one-time edit, or enough work to make monthly support useful. EdiCut offers single-video packages priced per deliverable and monthly plans that reserve editing time. Package details explain the limits, deliverables, and revision rounds before you choose.",
        "A single-video package defines limits such as finished length, raw-footage allowance, and revisions. Monthly editing and revisions use the plan’s reserved hours, and unused hours do not roll over. Work beyond listed scope can be quoted separately; EdiCut confirms any added price and timing before production starts. Compare the [current editing packages](/pricing) to choose an arrangement that matches the work you are ready to send."
      ], bullets: [
        "One video or recurring monthly editing capacity",
        "The finished length and source-footage limit",
        "Captions, cutdowns, graphics, and other requested deliverables",
        "Included revision rounds and the review owner on your side",
        "When the brief and footage will be ready"
      ]}
    ],
    faqs: [
      { question: "Who will edit my videos?", answer: "EdiCut assigns a primary editor who can learn your channel’s style, with a studio team available for coverage when needed. A shared style guide helps keep the approach consistent." },
      { question: "How does EdiCut review an edit?", answer: "The editor prepares the draft, then a creative director checks the story, sound, captions, and brand details before you review it. You can add timestamped feedback in the project workspace." },
      { question: "Can I hire EdiCut for one video?", answer: "Yes. EdiCut offers single-video packages as well as monthly plans. Check the current pricing page for package limits, deliverables, revision rounds, and plan details." },
      { question: "Does EdiCut promise a specific result for my channel?", answer: "No editing service can guarantee audience or channel results. EdiCut’s work is shaped by the footage, brief, agreed scope, review decisions, and publishing plan." }
    ],
    takeaway: "Choose EdiCut when a managed editing service, careful craft with human review, and clearly scoped single-video or monthly options fit your production workflow."
  },
  {
    slug: "youtube-audience-retention-editing-checklist",
    title: "YouTube Audience Retention: A Practical Editing Checklist",
    seoTitle: "YouTube Audience Retention Editing Checklist | EdiCut",
    description: "Use this YouTube audience retention editing checklist to review openings, pacing, visuals, and sound, then turn observations into clear notes for your editor.",
    excerpt: "Turn retention graphs into thoughtful edits, clearer openings, and useful review notes.",
    category: "Creator workflow",
    primaryKeyword: "YouTube audience retention editing checklist",
    publishedAt: "2026-10-23",
    author: "EdiCut editorial team",
    coverImage: "/images/blog/audience-retention-editing-1280.webp",
    coverAlt: "An illustrative audience retention curve beside a creator preview and a timeline note to trim repeated setup",
    socialImage: "/images/blog/audience-retention-editing.webp",
    intro: [
      "Use this YouTube audience retention editing checklist to find moments where the promise, explanation, picture, or sound stops serving the viewer. Review the surrounding footage, then give your editor a specific change to consider instead of asking them to make everything faster.",
      "The goal is a video people can follow and a repeatable way to learn from each upload. Here is how to combine the audience report with editorial judgment, whether you edit yourself or work with [EdiCut’s YouTube video editing service](/services/youtube-video-editing)."
    ],
    sections: [
      { id: "read-the-retention-report", title: "1. Read the retention report in context", paragraphs: [
        "Open a video’s Analytics in YouTube Studio and find its audience retention report. [YouTube’s key moments guidance](https://support.google.com/youtube/answer/9314415?hl=en) explains that dips can indicate skipped sections or people leaving; spikes can reflect rewatching or sharing, but can also mean a passage was unclear. The opening report looks at viewers still watching after the first 30 seconds. Data typically takes one to two days to process.",
        "Watch the section before and after a change in the graph. Write down what a viewer actually encounters: a repeated introduction, a silent loading screen, an unexplained result, or a transition to a new subject. A shape on a graph gives you a place to investigate; it does not tell you the cause by itself. Keep a short list of observations so one unusual moment does not drive a complete style change."
      ]},
      { id: "deliver-the-opening-promise", title: "2. Make the opening match the title and thumbnail", paragraphs: [
        "Before adding a dramatic hook, describe what the viewer expected when they clicked. A product comparison should establish the products and the comparison; a tutorial should make the task recognizable. If the video begins with unrelated channel updates, decide whether those updates belong after the first useful point or in another format.",
        "Try a plain opening that states the task, shows the problem, or previews an honest result. Keep whatever setup is necessary to understand the answer. The editor and the person planning the [YouTube thumbnail](/services/youtube-thumbnail-design) should work from the same promise, so the packaging and the footage support one another. More intense music cannot repair a mismatch between the promised subject and the actual video."
      ]},
      { id: "remove-repetition-with-care", title: "3. Trim repeated setup, not every quiet moment", paragraphs: [
        "Mark explanations that repeat the same information without adding evidence, a new step, or a useful example. An editor can often join the strongest setup to the strongest explanation, but should check that the shortened version still has a logical sequence. Removing a sentence that contains the only definition of a term can make the next section harder to understand.",
        "Listen for the purpose of each pause. Waiting for a page to load is different from giving the viewer time to inspect a comparison. Keep room for a reaction, a reveal, or a difficult instruction when it helps the idea land. For conversations, apply the same approach to the [video podcast workflow](/blog/video-podcast-editing-checklist): tighten repetition while preserving the speaker’s qualification and tone."
      ]},
      { id: "make-visuals-explain", title: "4. Show the detail the viewer needs next", paragraphs: [
        "Use supporting footage where words alone leave a gap. If the host describes a camera setting, show the setting at a readable size. If two results are being compared, hold them long enough to inspect and label them consistently. A cutaway should answer a question or guide attention, rather than interrupt the point just to create movement.",
        "Check captions, diagrams, screen recordings, and product labels in a phone-sized preview. Look for a missing subject, a pointer that arrives too late, or a graphic that covers the relevant control. A simple visual can do more than several decorative layers when it appears at the exact moment the explanation needs it."
      ]},
      { id: "check-listening-effort", title: "5. Reduce the effort of listening", paragraphs: [
        "Watch once on headphones and once through an ordinary phone speaker. Note dialogue that drops in level between takes, music that masks a key sentence, or an effect that distracts from a demonstration. Ask for a consistent, understandable listening experience before adding another sound effect.",
        "Review automated transcripts and captions against the recording, particularly names, numbers, and technical terms. Tools can help prepare a draft, but the final check needs the source and the intended meaning. Flag clipped or badly recorded audio early: editing may improve a recording, but it cannot reliably restore information that was never captured."
      ]},
      { id: "write-actionable-edit-notes", title: "6. Turn an observation into a review note", paragraphs: [
        "Use four parts: timestamp, observation, proposed direction, and a detail to protect. The following is an illustrative note for a fictional tutorial, not an EdiCut case study or a measured performance result.",
        "“At 01:40–02:05, we explain the export choice twice before showing the settings. Please keep the clearest explanation and bring the settings screen forward. Preserve the warning about overwriting the original file, and leave enough time to read the selected option.”",
        "This tells an editor what is difficult and what must survive the change. Add the note to your [editing brief or revision checklist](/blog/youtube-video-editing-brief-checklist), alongside the intended viewer and the video’s promise. EdiCut’s project manager can help keep the direction and review notes together; the editor then shapes the cut against the agreed scope."
      ], bullets: [
        "Identify the exact moment and the surrounding context.",
        "Describe the comprehension problem, not just the graph movement.",
        "Suggest one focused adjustment to test in the draft.",
        "Name any fact, qualification, or visual detail that must remain."
      ]},
      { id: "learn-without-overclaiming", title: "7. Compare future uploads without jumping to conclusions", paragraphs: [
        "After publishing, keep a short editing log: what changed, why it changed, and what you observed later. Compare videos with a similar format and viewer task. Topic, packaging, audience, and how people found the upload can differ, so a better-looking curve does not prove that one cut caused the improvement.",
        "Bring the useful observations into the next brief. If you want a team to handle that process with you, explore [why creators choose EdiCut](/blog/3-reasons-why-you-should-hire-edicut), then check the current [editing packages](/pricing). A clear brief and considered review are work you can control; views and rankings are outcomes no editor can promise."
      ]}
    ],
    faqs: [
      { question: "What is a good audience retention percentage?", answer: "There is no single target that makes every format successful. Consider length, subject, viewer expectations, and comparable videos on your channel. Review where people lose the thread before turning a percentage into an editing instruction." },
      { question: "Should my editor remove every pause?", answer: "No. Remove empty waiting or repeated setup when it adds nothing, but preserve pauses that let a viewer read, understand a step, or feel a reaction. Review the complete passage after shortening it." },
      { question: "How can I share retention information with an editor?", answer: "Share a relevant screenshot or a short summary with timestamps, the video’s goal, and your observations. You do not need to share account passwords or grant channel access to communicate these notes." },
      { question: "Can editing alone fix low retention?", answer: "Editing can improve clarity, structure, pacing, and sound. It cannot guarantee interest in the topic or correct every mismatch between the title, thumbnail, and recorded material. Review those choices together." }
    ],
    takeaway: "Use retention data to choose a moment to inspect, then use editorial judgment to decide what to change. The strongest revision note explains the viewer’s difficulty and protects the meaning of the video.",
    sources: [{ label: "YouTube Help: Measure key moments for audience retention", url: "https://support.google.com/youtube/answer/9314415?hl=en" }]
  },
  {
    slug: "video-podcast-editing-checklist",
    title: "Video Podcast Editing Checklist: From Recording to Final Review",
    seoTitle: "Video Podcast Editing Checklist for Creators | EdiCut",
    description: "Prepare a video podcast edit with this checklist for camera files, separate audio, sync, conversation cuts, captions, full episodes, clips, and final review.",
    excerpt: "Prepare the tracks, preserve the conversation, and hand over an episode with a clear plan.",
    category: "Production planning",
    primaryKeyword: "video podcast editing checklist",
    publishedAt: "2026-10-23",
    author: "EdiCut editorial team",
    coverImage: "/images/blog/video-podcast-workflow-1280.webp",
    coverAlt: "Two illustrated podcast speakers with microphones above synchronized camera and dialogue tracks",
    socialImage: "/images/blog/video-podcast-workflow.webp",
    serviceLink: { to: "/services/podcast-video-editing", label: "podcast editing service" },
    intro: [
      "A useful video podcast editing checklist covers source files, synchronized sound, conversation structure, camera choices, and the final deliverables. Agree on those items before handing over the recording so your editor can focus on the discussion instead of guessing which track or version to use.",
      "This guide walks through a full episode from file preparation to review. Use it for a single-camera interview or a multi-camera conversation, and adapt the scope with [EdiCut’s podcast video editing service](/services/podcast-video-editing) when you need a managed handoff."
    ],
    sections: [
      { id: "agree-podcast-deliverables", title: "1. Define the episode and the versions you need", paragraphs: [
        "Start with the number of speakers, camera angles, recording duration, and intended finished length. List each output separately: the complete video episode, an audio-only version if needed, caption files, or selected promotional clips. Confirm who supplies opening music, sponsor graphics, show artwork, and the approved names and titles.",
        "A conversation with three cameras and separate microphones is a different editing task from one continuous camera file. Finding highlights is also work, so say whether you will provide selects or need the editor to identify them. Check [current package scope](/pricing) and agree on timing, revision rounds, and additional versions before the edit starts."
      ]},
      { id: "prepare-podcast-source-files", title: "2. Label the original camera and audio files", paragraphs: [
        "Keep the original recordings intact and organize a working copy for handoff. Group files by episode and identify the speaker or camera angle in each name. If a camera split the session into several files, explain their order; do not quietly discard a segment because it looks like a duplicate.",
        "Provide each separate microphone track when available, along with any reference mix. Note missing sections, a camera that stopped early, or a microphone that distorted. These details affect the edit plan. Share access to the project folder, then check that the editor can open the necessary files without making the folder public. Our [sample editing brief](/blog/youtube-video-editing-brief-checklist) gives you a compact place to collect this information."
      ], bullets: [
        "Episode identifier and a file list with speaker and camera labels.",
        "Original camera files, separate audio tracks, and a reference mix if available.",
        "Episode outline, approved names, sponsor wording, and brand assets.",
        "Known recording issues, required removals, and any footage still to come."
      ]},
      { id: "verify-picture-sound-sync", title: "3. Verify picture and sound throughout the recording", paragraphs: [
        "Ask the editor to check sync near the beginning, middle, and end of the conversation. A visible clap or another shared reference can help align tracks, but a correct opening does not guarantee the whole recording stays aligned. Look at lip movement and listen for a doubled or echoing voice when several tracks overlap.",
        "If there is drift, identify which source changes and where, rather than shifting the whole episode until one passage happens to fit. Keep a note of corrections so later revisions use the same reference. A short camera dropout may need a different angle or an agreed visual cover; it should not be hidden by cutting away a sentence that matters."
      ]},
      { id: "preserve-the-conversation", title: "4. Tighten the conversation without changing its meaning", paragraphs: [
        "Mark repeated explanations, abandoned starts, private details, and interruptions that can be removed. Keep a question when the answer depends on it. Protect qualifications such as “in this example” or “for a beginner”; deleting them can turn a limited observation into a claim the guest did not make.",
        "Give the conversation room to sound human. A brief pause, laugh, or listener reaction may explain the next response. If you want a stronger opening, choose a moment that represents the episode honestly, then make the transition into the full discussion clear. For evaluating slow sections, the [audience retention editing checklist](/blog/youtube-audience-retention-editing-checklist) offers a way to write specific notes instead of requesting constant cuts."
      ]},
      { id: "choose-podcast-camera-cuts", title: "5. Make camera changes follow the exchange", paragraphs: [
        "Use the active speaker as a starting point, then consider when a reaction or a wider shot adds meaning. Cutting at every change of voice can become distracting when people overlap or give short acknowledgments. Let a wider view carry a lively exchange when separate close-ups would make it harder to follow.",
        "Check continuity across camera angles: body position, a lifted cup, a shared object, or the direction someone is looking. On a single-camera episode, a clean continuous shot may be the right choice. Use supplied B-roll or an agreed graphic when it explains a reference, rather than treating additional visual layers as a requirement."
      ]},
      { id: "review-podcast-sound-captions", title: "6. Review dialogue, names, and on-screen details", paragraphs: [
        "Listen for uneven speaker levels, background hum, abrupt room-tone changes, and music masking the conversation. Review on headphones and a phone speaker. Prioritize understandable dialogue; heavy processing can make a voice sound less natural, and damaged source audio may need a pickup rather than more cleanup.",
        "Check captions against the actual speech, including guest names, specialist terms, numbers, and negations. Confirm that speaker labels, opening titles, sponsor copy, and links match the approved brief. If a tool generates a transcript or finds suggested clips, treat that output as a draft requiring a person to check the source."
      ]},
      { id: "separate-episodes-and-clips", title: "7. Plan full episodes and promotional clips separately", paragraphs: [
        "For YouTube, a podcast show is a playlist and its episodes are videos. [YouTube’s podcast setup guidance](https://support.google.com/youtube/answer/12751636?hl=en) says the podcast playlist should contain full-length episodes in the order they should be consumed. Supporting Shorts do not appear in YouTube Music. Keep clips separate from the full-episode playlist.",
        "Choose a clip because it delivers a complete thought, not because it contains the loudest sentence. Record its source timestamp, necessary context, intended framing, and destination. The [guide to turning a long video into Shorts](/blog/repurpose-youtube-videos-into-shorts) explains how to rebuild a conversation moment for a smaller frame. Confirm the number of clips and the work involved as part of the agreed scope."
      ]},
      { id: "podcast-final-review-checklist", title: "8. Hand over one consolidated final review", paragraphs: [
        "Watch the episode all the way through before sending detailed changes. Then collect timestamped notes from the people responsible for approval. Name the source of the problem and the requested outcome: “At 18:42, the guest’s answer refers to the question we removed; please restore enough of that question to make the answer clear.”",
        "Use the checklist below for the final pass. In EdiCut’s project workspace, keep the brief and feedback with the project so your manager and editor can follow the same direction. If you are unsure which deliverables fit your recording, [send the team your episode details](/contact) before booking."
      ], bullets: [
        "Picture and dialogue stay synchronized at the beginning, middle, and end.",
        "Questions, answers, and edits preserve each speaker’s intended meaning.",
        "Names, captions, sponsor wording, music, and supplied assets match the approved brief.",
        "The opening, closing, and camera changes play cleanly without accidental gaps.",
        "Full episode, agreed additional versions, filenames, and review status are clearly identified."
      ]}
    ],
    faqs: [
      { question: "Can a video podcast work with one camera?", answer: "Yes. A clear, well-framed single-camera recording can carry a conversation. Agree on the visual treatment and any supplied graphics or B-roll; extra camera angles are not a condition for a useful episode." },
      { question: "Can an editor repair badly recorded podcast audio?", answer: "Some noise and level problems can be improved. Clipped, missing, or heavily distorted speech may not be recoverable. Flag problems early and agree whether to keep the section, use another source, or record it again." },
      { question: "Are social clips included in podcast editing?", answer: "Only when they are part of the agreed deliverables. Clip selection, vertical reframing, captions, and alternate versions take additional work. Confirm the number and treatment before the episode edit begins." },
      { question: "Should promotional clips go in my YouTube podcast playlist?", answer: "YouTube’s podcast guidance calls for full-length episodes in the podcast playlist. Keep promotional clips separate and use an accurate title and description to point viewers toward the relevant full episode." }
    ],
    takeaway: "A smooth podcast edit starts with organized recordings and a clear list of outputs. Preserve the conversation, check sync and dialogue carefully, and review the complete episode before approving individual clips.",
    sources: [{ label: "YouTube Help: Create a podcast in YouTube Studio", url: "https://support.google.com/youtube/answer/12751636?hl=en" }]
  }
];

export function getBlogPost(slug: string | undefined) {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function blogReadingMinutes(post: BlogPost) {
  const prose = [
    post.title,
    post.category,
    post.author,
    ...post.intro,
    ...post.sections.flatMap((section) => [section.title, ...section.paragraphs, ...(section.bullets ?? [])]),
    ...post.faqs.flatMap((faq) => [faq.question, faq.answer]),
    post.takeaway
  ].join(" ").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  const words = prose.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  return Math.max(1, Math.ceil(words / 220));
}
