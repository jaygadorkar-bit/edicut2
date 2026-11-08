export const hireEdicutStoryContent = {
  title: "3 reasons why you should hire EdiCut",
  description:
    "EdiCut’s video editing service combines dedicated project management, thoughtful editorial craft, and clear package scope for YouTube creators.",
  lede:
    "EdiCut’s video editing service helps YouTube creators move from raw footage to a finished video with less production coordination on their plate. Our team pairs dedicated project management with thoughtful editorial craft, studio review, and clear package scope. Choose a single-video edit or reserve monthly editing time, then stay connected through a project dashboard built for briefs, updates, and feedback. Here are three ways we make the process work for you.",
  sections: [
    {
      id: "one-managed-service",
      title: "1. One managed editing service keeps the work moving",
      kicker: "More room for the work only you can do",
      intro:
        "Our dedicated project manager helps carry your video from the brief through coordination, communication, and review, while your editor concentrates on shaping the cut. That means fewer production steps for you to chase and more time for planning, recording, and creating.",
      paragraphs: [
        "We begin with your brief, footage, brand assets, and style references. Your manager keeps questions, updates, and review notes connected to the project, while you stay involved in the creative direction without having to organize each handoff.",
        "Your project dashboard brings the practical tools together: share materials, follow progress, message your team, review edits, and download finished videos from your workspace. You can see what is ready and where your input is needed, whether we are working on one video or ongoing monthly projects.",
      ],
      points: [
        {
          title: "A dedicated project manager",
          copy: "We coordinate the brief, communication, and review handoff with you.",
        },
        {
          title: "Tools built around your project",
          copy: "Share footage, check progress, leave feedback, and receive your video in one workspace.",
        },
      ],
      link: { label: "Explore our YouTube editing service", to: "/services/youtube-video-editing" },
    },
    {
      id: "editorial-craft",
      title: "2. The edit gets attention from brief to final review",
      kicker: "Care in the details viewers notice",
      intro:
        "Our experienced editors bring editorial judgment to every cut. They shape the story, tune the pacing, and refine captions, color, and sound—then our studio reviews the draft before it reaches you.",
      paragraphs: [
        "Exceptional editing comes from a sequence of thoughtful decisions that helps the video land. We use your brief and references to decide what to keep, where to move faster, and where to give an idea room. Captions can clarify a key point, consistent color helps shots sit together, and a careful sound pass keeps dialogue clear. Each choice serves the story and the format.",
        "Our studio review adds another attentive pass before you receive the draft. Then your notes guide the next edit. Review the cut and leave feedback in your project workspace so the conversation stays attached to the video. Our portfolio offers reference examples for discussing style; ask us about relevant EdiCut-produced work for your format.",
      ],
      points: [
        {
          title: "Craft across the whole cut",
          copy: "We bring story, pacing, captions, color, and sound together around your video.",
        },
        {
          title: "Studio review, then your direction",
          copy: "We review each draft and use your feedback to guide the next pass.",
        },
      ],
      link: { label: "Explore style references", to: "/portfolio" },
    },
    {
      id: "clear-pricing",
      title: "3. Clear pricing lets you choose the scope that fits",
      kicker: "Know what the work includes",
      intro:
        "Get great value by choosing the editing scope you actually need. Bring us raw footage for one project or reserve monthly editing time for recurring work; we offer clear options for both.",
      paragraphs: [
        "Each single-video package is priced per deliverable and shows important limits such as finished length, raw-footage allowance, and revision rounds. Monthly plans reserve a stated amount of editing time; editing and revisions draw from those hours, and unused time does not roll over. Compare the package details with the work you have ready so you can choose the capacity that suits your channel.",
        "Need something beyond the listed scope, such as a longer edit, extra footage, custom visual effects, or project files? We can quote that work separately and confirm scope, price, and timing before production starts. Package options and prices can change, so check the current page for details before choosing.",
      ],
      points: [
        {
          title: "Choose the work you have ready",
          copy: "Pick one video or reserve monthly hours for recurring edits.",
        },
        {
          title: "Know the scope before we start",
          copy: "We confirm any additional work, price, and timing with you first.",
        },
      ],
      link: { label: "Compare current editing packages", to: "/pricing" },
    },
  ],
  toolingNote: {
    title: "We keep improving the way we edit",
    copy:
      "We continuously research new editing tools, including AI-assisted tools, and carefully test where they can help. Our team decides when to integrate them into the workflow, with people directing the creative choices and reviewing the finished work. Every integration must support a more useful workflow or a better edit, guided by editorial judgment.",
  },
  closing: {
    title: "Make room for your next idea.",
    copy:
      "Bring us the footage, format, and direction you have in mind. We’ll recommend a clear editing scope and walk you through the next steps before work begins.",
    primary: { label: "Explore editing packages", to: "/pricing" },
    secondary: { label: "Talk with the team", to: "/contact" },
  },
} as const;
