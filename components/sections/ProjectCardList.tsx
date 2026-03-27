import { projects } from "@/lib/content";
import BuildCard from "@/components/ui/BuildCard";

export default function ProjectCardList() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {projects.map((project, index) => (
        <BuildCard
          key={project.name}
          name={project.name}
          description={project.description}
          techStack={project.techStack}
          link={project.link || undefined}
          isPrivate={project.isPrivate}
          date={project.date}
          index={index}
          image={project.image}
        />
      ))}
    </div>
  );
}
