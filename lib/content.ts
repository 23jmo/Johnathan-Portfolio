import type { Experience, Project, Education, SocialLink, Award } from "@/types";

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
    name: "linkedin-semantic",
    language: "TypeScript",
    description: "Semantic search engine for LinkedIn connections and profiles.",
    link: "https://github.com/23jmo/linkedin-semantic",
    logo: "",
  },
  {
    name: "typr",
    language: "TypeScript",
    description: "Competitive typing racing app — real-time multiplayer.",
    link: "https://playtypr.com",
    logo: "",
  },
  {
    name: "Mojo",
    language: "Swift",
    description: "Mobile app project.",
    link: "",
    logo: "",
    isPrivate: true,
  },
  {
    name: "Comicgen",
    language: "Python",
    description: "AI-powered comic generation tool.",
    link: "",
    logo: "",
    isPrivate: true,
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
];

export const youtubeChannel = "https://www.youtube.com/@jmooooooooo";

export const ctaLink = "https://booking.akiflow.com/johnathan-m-0da1";

export interface Hackathon {
  name: string;
  icon: string;
  link?: string;
}

export const hackathons: Hackathon[] = [
  {
    name: "TreeHacks 2025",
    icon: "/icons/treehacks.svg",
    link: "https://devpost.com/software/omnom-hg16v3",
  },
  {
    name: "Devfest 2026",
    icon: "/icons/devfest.svg",
    link: "https://devpost.com/software/opticon",
  },
  {
    name: "Bootstrapping Reality 2025",
    icon: "/icons/bootstrapping-reality.svg",
  },
];
