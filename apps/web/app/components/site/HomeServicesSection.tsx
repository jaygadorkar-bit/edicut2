import { ArrowRight, ArrowUpRight, Clapperboard, Gamepad2, Image, Mic2, Smartphone, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { SERVICE_PAGES } from "../../lib/services";

const serviceDetails: Record<string, { icon: LucideIcon; description: string }> = {
  "youtube-video-editing": {
    icon: Clapperboard,
    description: "Tutorials, vlogs, reviews, and stories.",
  },
  "podcast-video-editing": {
    icon: Mic2,
    description: "Clear audio and natural conversation.",
  },
  "short-form-video-editing": {
    icon: Smartphone,
    description: "Shorts, Reels, and TikToks with a clear hook.",
  },
  "gaming-video-editing": {
    icon: Gamepad2,
    description: "Gameplay, stream highlights, and reactions.",
  },
  "youtube-thumbnail-design": {
    icon: Image,
    description: "A clear visual for your next upload.",
  },
};

export function HomeServicesSection() {
  return (
    <section id="editing-services" className="home-services" aria-labelledby="home-services-title" data-analytics-region="services">
      <div className="home-services__layout">
        <div className="home-services__intro">
          <p className="neo-section-label">
            <Clapperboard size={16} aria-hidden="true" />
            What we edit
          </p>
          <h2 id="home-services-title" className="yt-title neo-ink">
            Video editing services for your channel.
          </h2>
          <p className="home-services__description">
            Explore what’s included, how to prepare your footage, and how reviews work for each format.
          </p>
          <Link to="/services" className="neo-button neo-button--secondary home-services__all">
            Explore all services
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>

        <nav aria-label="Video editing services" className="neo-surface home-services__directory">
          <ul>
            {SERVICE_PAGES.map((service) => {
              const { icon: Icon, description } = serviceDetails[service.slug] ?? {
                icon: Clapperboard,
                description: service.format,
              };

              return (
                <li key={service.slug}>
                  <Link to={`/services/${service.slug}`} className="group home-services__link">
                    <span className="neo-icon-badge home-services__icon">
                      <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <div className="home-services__copy">
                      <h3>{service.title}</h3>
                      <p>{description}</p>
                    </div>
                    <ArrowUpRight className="home-services__arrow" size={20} aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </section>
  );
}
