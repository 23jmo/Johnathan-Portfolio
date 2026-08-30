import type { Experience, Project, Education, SocialLink, Award, Hackathon } from "@/types";

export const experiences: Experience[] = [
  {
    title: "Incoming QSD Intern",
    company: "SIG",
    logo: "/images/logos/sig.svg",
    date: "Summer 2025",
    description:
      "Susquehanna International Group — Quantitative Systematic Development.",
    link: "https://sig.com",
  },
  {
    title: "SWE Intern",
    company: "Google",
    logo: "/images/logos/google.svg",
    date: "Summer 2025",
    description: "Borglet Team — core infrastructure and cluster management.",
    link: "https://google.com",
  },
  {
    title: "Research Assistant",
    company: "CGUI Lab",
    logo: "/images/logos/columbia.svg",
    date: "2024 – Present",
    description:
      "Columbia University Computer Graphics & User Interfaces Lab — researching novel interaction techniques.",
    link: "https://www.cs.columbia.edu/cg/",
  },
  {
    title: "AR/VR SWE Intern",
    company: "NIH",
    logo: "/images/logos/nih.svg",
    date: "May 2024 – Aug 2024",
    description:
      "Pioneered a medical AR interaction and visualization application using Unity, C#, Photon Fusion, OpenAI, and Azure Speech Services for surgical application. Presented to the NIBIB Scientific Director and a team of surgeons.",
    link: "https://www.nibib.nih.gov",
  },
  {
    title: "Research Assistant",
    company: "UMich Cai Lab",
    logo: "/images/logos/umich.png",
    date: "Sep 2023 – May 2024",
    description:
      "Innovated ML algorithm for 3D neuron segmentation — 50% memory reduction and 26x faster processing. Presented to 500+ students at research fair.",
    link: "https://umich.edu",
    logoScale: 0.5,
    logoBackground: "white",
  },
  {
    title: "Research Assistant",
    company: "Stanford Optima Group",
    logo: "/images/logos/stanford.svg",
    date: "May 2023 – Aug 2023",
    description:
      "Compared CNNs vs Visual LLMs for glaucoma detection. Improved VLLM performance by 30% using Few-Shot and Chain-of-Thought prompting.",
    link: "https://optima.stanford.edu",
  },
  {
    title: "Senior Advisor",
    company: "V1 @ Michigan",
    logo: "/images/logos/v1michigan.png",
    date: "2023 – 2024",
    description:
      "Mentored student founders at Michigan's premier startup community.",
    link: "https://v1michigan.com",
  },
];

export const projects: Project[] = [
  {
    name: "Tabby",
    language: "Swift",
    description: "Universal AI autocomplete for macOS — Cursor-like ghost text in every text field.",
    link: "https://www.tabby-ai.com/",
    logo: "",
    techStack: ["Swift", "macOS", "Next.js"],
    date: "2026",
    image: "/images/projects/tabby.png",
  },
  {
    name: "drafted.college",
    language: "TypeScript",
    description: "AI-powered college essay editing platform — real-time feedback and draft management.",
    link: "https://drafted.college",
    logo: "",
    techStack: ["TypeScript", "Next.js", "AI"],
    date: "2026",
    image: "/images/projects/drafted.png",
  },
  {
    name: "Argue",
    language: "Swift, TypeScript",
    description: "AI-powered screen time negotiation app — set limits through conversation, not restriction.",
    link: "https://argue-landing.vercel.app/",
    logo: "",
    techStack: ["Swift", "SwiftUI", "TypeScript", "Chrome Extension"],
    date: "2026",
    image: "/images/projects/argue.png",
  },
  {
    name: "linkedin-semantic",
    language: "TypeScript",
    description: "Semantic search engine for LinkedIn connections and profiles.",
    link: "https://github.com/23jmo/linkedin-semantic",
    logo: "",
    techStack: ["TypeScript", "Next.js", "OpenAI", "Pinecone"],
    date: "2025",
    image: "/images/projects/linkedin-semantic.png",
  },
  {
    name: "typr",
    language: "TypeScript",
    description: "Competitive typing racing app — real-time multiplayer.",
    link: "https://playtypr.com",
    logo: "",
    techStack: ["TypeScript", "Next.js", "WebSockets", "Tailwind CSS"],
    date: "2024",
    image: "/images/projects/typr.png",
  },
  {
    name: "Comicgen",
    language: "Python",
    description: "AI-powered comic generation tool.",
    link: "",
    logo: "",
    isPrivate: true,
    techStack: ["Python", "Stable Diffusion", "Flask"],
    date: "2023",
  },
];

export const education: Education[] = [
  {
    school: "Columbia",
    logo: "/images/logos/columbia.svg",
    degree: "CS",
    gpa: "3.95 / 4.0",
    date: "2024 – 2028",
    link: "https://columbia.edu",
  },
  {
    school: "U-M",
    logo: "/images/logos/umich.png",
    degree: "B.E. (Transferred)",
    gpa: "4.00 / 4.0",
    date: "2022 – 2024",
    link: "https://umich.edu",
    logoBackground: "white",
    logoScale: 0.5,
  },
];

export const awards: Award[] = [
  {
    title: "TreeHacks 2026 Winner",
    description: "",
    icon: "/icons/treehacks.svg",
  },
  {
    title: "TreeHacks 2025 Winner",
    description: "",
    icon: "/icons/treehacks.svg",
  },
  {
    title: "Perfect PSAT",
    description: "",
    icon: "/icons/psat.svg",
  },
  {
    title: "Perfect ACT",
    description: "",
    icon: "/icons/act.svg",
  },
  {
    title: "AFORE Grant Fellow",
    description: "",
    icon: "/icons/afore.svg",
  },
];

export const socialLinks: SocialLink[] = [
  {
    name: "GitHub",
    url: "https://github.com/23jmo",
    icon: "/icons/github.svg",
  },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/in/johnathan-mo/",
    icon: "/icons/linkedin.svg",
  },
  {
    name: "X",
    url: "https://x.com/its_jmomo",
    icon: "/icons/twitter.svg",
  },
  {
    name: "Instagram",
    url: "https://instagram.com/jmomomo_",
    icon: "/icons/instagram.svg",
  },
  {
    name: "Email",
    url: "mailto:johnathan.mo@columbia.edu",
    icon: "/icons/email.svg",
  },
];

export const youtubeChannel = "https://www.youtube.com/@jmooooooooo";

export const ctaLink = "mailto:2023johnathanmo@gmail.com";

export const hackathons: Hackathon[] = [
  {
    name: "TreeHacks 2026",
    projectName: "Mira",
    icon: "/icons/treehacks.svg",
    link: "https://devpost.com/software/mira-3xqlos",
    description: "AI-powered smart mirror for personalized styling and outfit recommendations.",
    techStack: ["React", "TypeScript", "Python", "MediaPipe", "OpenAI", "ElevenLabs"],
    isWinner: true,
    awards: [{ name: "Future of Commerce", prize: "$10,000" }],
    image: "/images/hackathons/mira.png",
  },
  {
    name: "TreeHacks 2025",
    projectName: "OmNom",
    icon: "/icons/treehacks.svg",
    link: "https://devpost.com/software/omnom-hg16v3",
    description: "6-foot autonomous robot that fetches food across campus using computer vision.",
    techStack: ["React", "Python", "FastAPI", "YOLOv8", "OpenAI", "Arduino"],
    isWinner: true,
    awards: [{ name: "Most Creative Hack" }],
    image: "/images/hackathons/omnom.png",
  },
  {
    name: "Devfest 2026",
    projectName: "Opticon",
    icon: "/icons/devfest.svg",
    link: "https://devpost.com/software/opticon",
    description: "Orchestrates multiple AI agents in isolated VMs for parallel task execution.",
    techStack: ["Next.js", "Python", "Socket.io", "E2B", "PostgreSQL"],
    isWinner: true,
    awards: [{ name: "Best Computer Use" }, { name: "Best Use of K2 Think" }],
    image: "/images/hackathons/opticon.png",
  },
  {
    name: "Bootstrapping Reality 2025",
    projectName: "Orby",
    icon: "/icons/bootstrapping-reality.svg",
    description: "AR/VR hackathon exploring spatial interaction techniques.",
    techStack: ["Unity", "C#", "Meta Quest SDK"],
    isWinner: true,
    awards: [{ name: "Winner" }],
  },
];
