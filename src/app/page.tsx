import { LandingNav } from '@/components/landing/LandingNav';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingDemo } from '@/components/landing/LandingDemo';
import { LandingShowcases, LandingFeatures } from '@/components/landing/LandingShowcases';
import { LandingArchitecture, LandingTeam, LandingCTA, LandingFooter } from '@/components/landing/LandingSections';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNav />
      <main>
        <LandingHero />
        <LandingDemo />
        <LandingShowcases />
        <LandingFeatures />
        <LandingArchitecture />
        <LandingTeam />
        <LandingCTA />
      </main>
      <LandingFooter />
    </div>
  );
}
