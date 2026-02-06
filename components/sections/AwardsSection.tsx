import { awards } from "@/lib/content";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function AwardsSection() {
  return (
    <FadeInOnScroll>
      <section>
        <p className="text-xl leading-relaxed text-foreground/90">
          {awards.map((award, index) => (
            <span key={award.title}>
              {index > 0 && " "}
              <strong>{award.title}</strong> ({award.description})
              {index < awards.length - 1 ? "," : "."}
            </span>
          ))}
        </p>
      </section>
    </FadeInOnScroll>
  );
}
