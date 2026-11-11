export type ServicePage = {
  slug: string;
  title: string;
  heading?: string;
  metaTitle: string;
  description: string;
  summary: string;
  introduction: string;
  audience: string;
  format: string;
  focus: string;
  deliverables: Array<{ title: string; description: string }>;
  preparation: string[];
  process: Array<{ title: string; description: string }>;
  questions: Array<{ question: string; answer: string }>;
  relatedSlugs: string[];
};

export const SERVICE_PAGES: readonly ServicePage[] = [
  {
    slug: "youtube-video-editing",
    title: "YouTube video editing",
    heading: "Hire a YouTube video editor for your channel",
    metaTitle: "YouTube Video Editor for Creators | EdiCut",
    description: "Looking for a video editor for your YouTube channel? EdiCut edits tutorials, commentary, reviews, education, and vlogs with clear scope and package options.",
    summary: "Done-for-you YouTube video editing for tutorials, commentary, reviews, educational videos, and vlogs, with scope agreed before work begins.",
    introduction: "EdiCut is a done-for-you YouTube video editing service for creators. Share your footage, brief, and channel references; the team shapes talking-head videos, educational content, product reviews, commentary, and vlogs into a first cut you can review in your workspace. We agree on footage limits, finished length, visual treatment, delivery schedule, and revisions before editing starts.",
    audience: "Creators and small teams publishing tutorials, commentary, reviews, educational videos, and vlogs on YouTube.",
    format: "Long-form video",
    focus: "Structure, clarity, and channel style",
    deliverables: [
      { title: "A clearer story", description: "Organize the material around your main idea, tighten repeated points, and remove pauses or distractions that interrupt the flow." },
      { title: "Visual support with a purpose", description: "Use your supplied B-roll, screen recordings, titles, and agreed graphics to explain the subject. References help us match the level of visual detail you want." },
      { title: "Consistent finishing", description: "Bring dialogue, basic color, captions, and the final export together within the selected package's scope. Confirm any advanced motion or asset requirements before the edit begins." },
    ],
    preparation: [
      "Source footage and separate audio tracks, shared with the permissions your editor needs.",
      "A short brief describing the topic, intended viewer, and key message.",
      "Your script or outline, any preferred takes, and material that must stay in the video.",
      "Channel references, brand assets, and the finished length you are aiming for.",
    ],
    process: [
      { title: "Set the direction", description: "Choose a suitable package, then agree on footage limits, finished length, visual style, and the delivery schedule with the team." },
      { title: "Review the first cut", description: "Watch the story as a complete piece. Add timestamped notes for pacing, missing context, and any changes to the visual treatment." },
      { title: "Approve your export", description: "Review the included revisions and confirm the agreed delivery format. Keep your video title and thumbnail aligned with what the opening delivers." },
    ],
    questions: [
      { question: "Is EdiCut a video editing app or a service?", answer: "EdiCut is a done-for-you video editing service for YouTube creators, not self-editing software. Share your footage and brief, choose a single-video or monthly package, and review the cut through your project workspace." },
      { question: "What should I compare before hiring a YouTube video editor?", answer: "Review work the editor actually produced, then compare raw-footage and finished-length limits, included services, revision rounds, delivery timing, and how you leave feedback. EdiCut's current package scope is listed on the pricing page; the team confirms your brief before editing." },
      { question: "Can you follow my existing channel's editing style?", answer: "Share examples from your channel and explain what you want to keep or change, such as pacing, caption style, music, and recurring graphics. We use those references to agree on a direction before editing." },
      { question: "Are thumbnails and Shorts included with a YouTube edit?", answer: "Every video edit includes one custom thumbnail at no extra charge. Short-form cutdowns have separate scope; see the package options or ask the team for a quote." },
      { question: "Which editing package should I choose?", answer: "Compare your raw-footage length, expected finished length, and revision needs with the current package limits. For a regular publishing schedule, ask whether reserved monthly editing hours suit your workload." },
    ],
    relatedSlugs: ["youtube-thumbnail-design", "short-form-video-editing", "podcast-video-editing"],
  },
  {
    slug: "podcast-video-editing",
    title: "Podcast video editing",
    metaTitle: "Podcast Video Editing Services | EdiCut",
    description: "Shape interviews and video podcasts with EdiCut. Plan camera cuts, dialogue cleanup, episode structure, and optional social clips around your recording.",
    summary: "Keep the conversation natural while making camera changes, dialogue, and episode structure easier to follow.",
    introduction: "A good podcast edit gives the conversation room to breathe. We help shape recorded interviews and discussions into video episodes, using your editorial notes to decide what to tighten and what to preserve. For multiple cameras or speakers, the brief establishes how the episode should look and sound before the edit starts.",
    audience: "Podcast hosts, interview channels, and teams recording conversations for YouTube or their own audience.",
    format: "Interviews and video podcasts",
    focus: "Natural conversation and speaker clarity",
    deliverables: [
      { title: "An intentional conversation", description: "Trim setup time, repeated sections, and agreed removals while preserving the speaker's meaning. Flag sensitive or off-record passages in the brief." },
      { title: "Camera and speaker continuity", description: "Plan switches between available camera angles and shared-screen material. Consistent framing and speaker identifiers help the audience stay oriented." },
      { title: "Dialogue and episode presentation", description: "Work with your supplied audio tracks, intro, outro, and brand assets for a consistent episode. Confirm the amount of audio repair, captions, and graphics needed for your recording." },
    ],
    preparation: [
      "All camera recordings and separate speaker audio files, with complete takes and consistent file names.",
      "An outline of the discussion and timestamps for sections to remove or highlight.",
      "Correct speaker names, titles, pronunciations, and any sponsor wording that must remain exact.",
      "Your intro, outro, brand assets, target episode length, and any requested clip deliverables.",
    ],
    process: [
      { title: "Check the recording", description: "Tell us the number of cameras and audio tracks, the total recording length, and any known sync or sound problems. The team confirms scope before editing." },
      { title: "Shape the episode", description: "Review the conversation for continuity and accuracy as well as camera cuts. Timestamped feedback helps distinguish editorial changes from visual adjustments." },
      { title: "Prepare the release", description: "Approve the main episode and any separately agreed versions. If you need short clips, identify the moments and destination platforms as part of that additional scope." },
    ],
    questions: [
      { question: "Can you edit a podcast recorded with multiple cameras?", answer: "Send the number of angles, recording length, separate audio tracks, and a sample of the footage. The team can confirm the editing requirements and a suitable quote before you commit." },
      { question: "Can you remove background noise from a podcast?", answer: "Basic audio cleanup may help, but the result depends on the source recording. Share a sample if there is echo, clipping, overlapping speech, or heavy noise so the team can assess what is practical." },
      { question: "Can the episode become Shorts or Reels?", answer: "Yes, short-form editing can be scoped alongside the episode. Tell us how many clips you need, whether you will supply timestamps, and which platforms and aspect ratios you want." },
    ],
    relatedSlugs: ["short-form-video-editing", "youtube-video-editing", "youtube-thumbnail-design"],
  },
  {
    slug: "short-form-video-editing",
    title: "Short-form video editing",
    metaTitle: "Short-Form Video Editing for Shorts, Reels & TikTok | EdiCut",
    description: "Create focused Shorts, Reels, and TikTok videos with EdiCut. Plan hooks, vertical framing, readable captions, and cutdowns from longer recordings.",
    summary: "Give one idea a strong opening, a clear payoff, and a vertical edit designed for small screens.",
    introduction: "A short video needs to make sense on its own. We edit original short recordings and cutdowns from longer videos around one useful idea, moment, or story. Instead of simply cropping a full video, the brief covers the opening, context, captions, framing, and intended platform for each piece.",
    audience: "Creators and brands producing YouTube Shorts, Instagram Reels, TikTok videos, or clips from longer content.",
    format: "Shorts, Reels, and TikTok",
    focus: "One idea, readable on a small screen",
    deliverables: [
      { title: "A self-contained cut", description: "Start with the moment or question that makes the clip understandable, then trim the sequence around its payoff. Include enough context to represent the original speaker accurately." },
      { title: "Thoughtful vertical framing", description: "Reframe usable source footage for the agreed aspect ratio, keeping faces and relevant actions in view. Tell us where platform controls or your own overlays need space." },
      { title: "Captions and on-screen emphasis", description: "Use legible captions and selective text to help the viewer follow the clip. Your references establish how restrained or expressive the graphics should be." },
    ],
    preparation: [
      "The original recording or links to the longer source video, with suitable quality for reframing.",
      "Your chosen moments or a brief for selecting them, plus the number of clips required.",
      "Destination platforms, target duration, aspect ratios, and any text-safe area requirements.",
      "Brand fonts, caption references, correct names, and your preferred call to action.",
    ],
    process: [
      { title: "Define the clip", description: "Agree on the audience, central idea, quantity, and source footage. Choosing moments from a long recording can require different scope from editing supplied timestamps." },
      { title: "Review on a small screen", description: "Check that the opening makes sense, captions stay readable, and important details remain visible. Give timestamped feedback on wording, timing, and framing." },
      { title: "Approve each version", description: "Review the agreed platform exports and revisions. If the same idea needs different cuts or aspect ratios, include those versions in the project brief." },
    ],
    questions: [
      { question: "Can you turn a long YouTube video or podcast into short clips?", answer: "Yes. Share the source and either your preferred timestamps or a brief for finding useful moments. Confirm the number of clips, target lengths, and whether clip selection is part of the quoted work." },
      { question: "Can one short video be used on several platforms?", answer: "Often it can, but platform overlays, duration limits, framing, music rights, and your publishing goals may require changes. List every destination so the team can confirm the versions you need." },
      { question: "Do you guarantee views or viral results?", answer: "No. Editing can improve clarity and presentation, but reach depends on the topic, audience, publishing decisions, and platform distribution. We agree on the creative work and deliverables for your project." },
    ],
    relatedSlugs: ["podcast-video-editing", "youtube-video-editing", "gaming-video-editing"],
  },
  {
    slug: "gaming-video-editing",
    title: "Gaming video editing",
    metaTitle: "Gaming Video Editing Services for Creators | EdiCut",
    description: "Build gaming videos from gameplay, commentary, and stream recordings with EdiCut. Plan highlights, timing, sound, and channel style before the edit.",
    summary: "Find the story in a session, keep the important context, and let your reactions and gameplay carry the edit.",
    introduction: "A gaming session can contain a challenge, an unexpected outcome, or a run of moments worth sharing. We work from gameplay, commentary, facecam footage, and your notes to build a video with a clear direction. The editing style should fit your game and personality, whether that means a measured walkthrough or a faster highlight cut.",
    audience: "Gaming creators making commentary videos, walkthroughs, challenges, stream highlights, and short gameplay clips.",
    format: "Gameplay and stream highlights",
    focus: "Context, reaction timing, and sound",
    deliverables: [
      { title: "A watchable session", description: "Cut loading screens, repetition, and downtime while keeping the context viewers need. A stated challenge or progression helps connect individual moments." },
      { title: "Gameplay and personality together", description: "Balance gameplay, facecam, and commentary so the viewer can follow the action and your reactions. Supply separate tracks when available for more control over the mix." },
      { title: "A channel-specific finish", description: "Agree on captions, music, sound effects, zooms, and graphics using references. Include meme assets and specialist motion requirements in the brief so the team can scope them." },
    ],
    preparation: [
      "Gameplay and facecam recordings, plus separate microphone, game, and voice-chat audio when available.",
      "The game title, video premise, and timestamps for key moments in a long session.",
      "Examples of your channel style, including how much music, captions, and effects you prefer.",
      "Notes about spoilers, player names to obscure, copyrighted music, or moments to leave out.",
    ],
    process: [
      { title: "Agree on the story", description: "Explain the challenge, match, or progression behind the footage. Confirm the total recording length and whether locating highlights is part of the work." },
      { title: "Check timing and context", description: "Review that the edit preserves what happened in the game and gives reactions enough space. Flag cuts that make mechanics or the sequence of events unclear." },
      { title: "Finish for your channel", description: "Approve the sound mix, visual style, included custom thumbnail, and agreed export. Request vertical highlights or additional thumbnail concepts separately." },
    ],
    questions: [
      { question: "Can you work with a full stream recording?", answer: "Share its duration and explain whether you will provide highlight timestamps. Searching a long stream and editing selected moments take different amounts of work, so the team will confirm the scope and footage limits." },
      { question: "Can you match a fast, meme-heavy gaming style?", answer: "Provide references and the assets you want to use. Discuss the amount of sound design, graphics, captions, and motion before choosing a package so the team can assess the editing requirements." },
      { question: "Should I record audio on separate tracks?", answer: "Separate microphone, game, music, and voice-chat tracks give the editor more control. If your recording has only a mixed track, share a sample so the team can assess the available options." },
    ],
    relatedSlugs: ["youtube-video-editing", "short-form-video-editing", "youtube-thumbnail-design"],
  },
  {
    slug: "youtube-thumbnail-design",
    title: "YouTube thumbnail design",
    metaTitle: "YouTube Thumbnail Design for Creator Videos | EdiCut",
    description: "Plan a clear YouTube thumbnail with EdiCut. Align the concept with your video title, supply useful source images, and review the design at a small size.",
    summary: "Give your video a clear visual idea that works beside its title and stays readable at a small size.",
    introduction: "A thumbnail helps a viewer understand what a video offers before they open it. We design around your subject, title, and channel identity, using supplied photographs or frames and an agreed visual direction. The image should create a clear expectation that the video can deliver.",
    audience: "YouTube creators who need a thumbnail for an upcoming upload or a consistent look across a series.",
    format: "YouTube thumbnail",
    focus: "A clear idea beside your title",
    deliverables: [
      { title: "One visual direction", description: "Choose the subject and central idea before adding detail. The title and image should complement each other so neither needs to explain the whole video alone." },
      { title: "A legible composition", description: "Give the main subject a clear place in the frame. Use deliberate contrast, cropping, and limited text to keep the design understandable when displayed small." },
      { title: "A channel-aware design", description: "Work with your supplied brand assets, photography, and existing references. Confirm the number of concepts, revisions, and required file formats before design begins." },
    ],
    preparation: [
      "The video topic, draft title, intended viewer, and main promise of the video.",
      "High-resolution source photos, clean frames, or product images that you have permission to use.",
      "Your logo, brand colors, type references, and examples from your existing channel.",
      "Any exact wording, required elements, and the number of concepts or variants you need.",
    ],
    process: [
      { title: "Choose the concept", description: "Explain the video's subject and what makes this upload distinct. Agree on the image, wording, and design scope before work starts." },
      { title: "Review at thumbnail size", description: "Check whether the subject and message are recognizable without enlarging the image. Confirm names, figures, and claims against the actual video." },
      { title: "Approve the final artwork", description: "Review the agreed revisions and delivery file. If you want alternate concepts for a platform test, request those variants in the scope." },
    ],
    questions: [
      { question: "Is a thumbnail included with a video editing package?", answer: "Yes. Every video editing package includes one custom thumbnail per edited video at no extra charge. This page also covers standalone thumbnail design; ask for a quote if you need additional concepts or variants." },
      { question: "Can I order several thumbnail concepts?", answer: "Ask for the number of distinct concepts or variants you need before work begins. Additional concepts and A/B testing sets can be quoted separately." },
      { question: "Will a new thumbnail guarantee more clicks?", answer: "No. A clearer design can help communicate a video's subject, but clicks also depend on the title, topic, audience, and where the video appears. Assess a design using your channel's actual publishing data." },
    ],
    relatedSlugs: ["youtube-video-editing", "gaming-video-editing", "podcast-video-editing"],
  },
];

export function getServiceBySlug(slug: string | undefined) {
  return SERVICE_PAGES.find((service) => service.slug === slug);
}
