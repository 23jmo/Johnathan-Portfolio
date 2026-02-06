export interface Experience {
  title: string;
  company: string;
  logo: string;
  date: string;
  description: string;
}

export interface Project {
  name: string;
  language: string;
  description: string;
  link: string;
  logo: string;
  isPrivate?: boolean;
}

export interface Education {
  school: string;
  logo: string;
  degree: string;
  gpa: string;
  date: string;
}

export interface SocialLink {
  name: string;
  url: string;
  icon: string;
}

export interface Award {
  title: string;
  description: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  content: string;
}

export interface SpotifyTrack {
  isPlaying: boolean;
  title?: string;
  artist?: string;
  albumImageUrl?: string;
  songUrl?: string;
}
