import { ctaLink } from "@/lib/content";
import FadeInOnScroll from "@/components/ui/FadeInOnScroll";

export default function CTAFooter() {
  return (
    <FadeInOnScroll>
      <section className="text-center py-8">
        <p className="text-xl mb-4">Want to say hi?</p>
        <a
          href={ctaLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 rounded-full bg-accent text-white font-medium hover:opacity-90 transition-opacity"
        >
          Schedule a chat
        </a>
      </section>
    </FadeInOnScroll>
  );
}
