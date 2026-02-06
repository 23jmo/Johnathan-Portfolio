import type { Experience, Project, Education, SocialLink, Award } from "@/types";

export const experiences: Experience[] = [
  {
    title: "Incoming QSD Intern",
    company: "SIG",
    logo: "/images/logos/sig.svg",
    date: "Summer 2025",
    description:
      "Susquehanna International Group — Quantitative Systematic Development.",
  },
  {
    title: "SWE Intern",
    company: "Google",
    logo: "/images/logos/google.svg",
    date: "Summer 2025",
    description: "Borglet Team — core infrastructure and cluster management.",
  },
  {
    title: "Research Assistant",
    company: "CGUI Lab",
    logo: "/images/logos/cgui.svg",
    date: "2024 – Present",
    description:
      "Columbia University Computer Graphics & User Interfaces Lab — researching novel interaction techniques.",
  },
  {
    title: "AR/VR SWE Intern",
    company: "NIH",
    logo: "/images/logos/nih.png",
    date: "May 2024 – Aug 2024",
    description:
      "Pioneered a medical AR interaction and visualization application using Unity, C#, Photon Fusion, OpenAI, and Azure Speech Services for surgical application. Presented to the NIBIB Scientific Director and a team of surgeons.",
  },
  {
    title: "Research Assistant",
    company: "UMich Cai Lab",
    logo: "/images/logos/umich.png",
    date: "Sep 2023 – May 2024",
    description:
      "Innovated ML algorithm for 3D neuron segmentation — 50% memory reduction and 26x faster processing. Presented to 500+ students at research fair.",
  },
  {
    title: "Research Assistant",
    company: "Stanford Optima Group",
    logo: "/images/logos/stanford.svg",
    date: "May 2023 – Aug 2023",
    description:
      "Compared CNNs vs Visual LLMs for glaucoma detection. Improved VLLM performance by 30% using Few-Shot and Chain-of-Thought prompting.",
  },
  {
    title: "Senior Advisor",
    company: "V1 @ Michigan",
    logo: "/images/logos/v1michigan.svg",
    date: "2023 – 2024",
    description:
      "Mentored student founders at Michigan's premier startup community.",
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
    link: "https://github.com/23jmo/typr",
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
    school: "Columbia University",
    logo: "/images/logos/columbia.svg",
    degree: "B.E. Computer Science",
    gpa: "3.95 / 4.0",
    date: "2024 – 2028",
  },
  {
    school: "University of Michigan",
    logo: "/images/logos/umich.png",
    degree: "B.E. (Transferred)",
    gpa: "4.00 / 4.0",
    date: "2022 – 2024",
  },
];

export const awards: Award[] = [
  {
    title: "TreeHacks 2025 Winner",
    description: "Stanford's annual hackathon.",
  },
  {
    title: "Dean's List",
    description: "University of Michigan College of Engineering.",
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
    name: "YouTube",
    url: "https://youtube.com/@johnathanmo",
    icon: "/icons/youtube.svg",
  },
  {
    name: "X",
    url: "https://x.com/johnathanmo",
    icon: "/icons/twitter.svg",
  },
  {
    name: "Instagram",
    url: "https://instagram.com/johnathanmo",
    icon: "/icons/instagram.svg",
  },
];

export const youtubeChannel = "https://youtube.com/@johnathanmo";

export const ctaLink = "https://calendly.com/johnathanmo";
