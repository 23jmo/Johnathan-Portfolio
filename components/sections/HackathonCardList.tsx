import { hackathons } from "@/lib/content";
import BuildCard from "@/components/ui/BuildCard";

export default function HackathonCardList() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {hackathons.map((hackathon, index) => (
        <BuildCard
          key={hackathon.name}
          name={hackathon.projectName}
          subtitle={hackathon.name}
          description={hackathon.description}
          techStack={hackathon.techStack}
          link={hackathon.link}
          showAward={hackathon.isWinner}
          awards={hackathon.awards}
          index={index}
          icon={hackathon.icon}
        />
      ))}
    </div>
  );
}
