import FadeInOnScroll from "@/components/ui/FadeInOnScroll";
import ProjectCardList from "@/components/sections/ProjectCardList";
import HackathonCardList from "@/components/sections/HackathonCardList";

export default function BuildsView() {
  return (
    <div className="space-y-10">
      <section>
        <FadeInOnScroll>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">
            Projects
          </h2>
        </FadeInOnScroll>
        <ProjectCardList />
      </section>
      <section>
        <FadeInOnScroll>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">
            Hackathons
          </h2>
        </FadeInOnScroll>
        <HackathonCardList />
      </section>
    </div>
  );
}
