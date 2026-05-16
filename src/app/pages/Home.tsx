import { Link } from "react-router"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Sparkles, Compass, UserCheck, Heart, Star, BookOpen, Quote } from "lucide-react"
import { ImageWithFallback } from "../components/figma/ImageWithFallback"

export function Home() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative w-full py-20 md:py-32 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-r from-white/90 to-white/50 z-10" />
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1743112943399-fc221eefd181?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjYWxtaW5nJTIwbWVkaXRhdGlvbiUyMHdvbWFuJTIwbWluaW1hbGlzdHxlbnwxfHx8fDE3Nzg1ODIwOTN8MA&ixlib=rb-4.1.0&q=80&w=1080"
            alt="Calming background"
            className="w-full h-full object-cover object-center"
          />
        </div>
        <div className="container relative z-20 mx-auto px-4 md:px-8 max-w-5xl">
          <div className="max-w-2xl space-y-8">
            <div className="inline-flex items-center rounded-full border border-[#C5A880]/30 bg-white/60 px-4 py-1.5 text-sm text-[#8E7CC3] backdrop-blur-sm">
              <Sparkles className="mr-2 h-4 w-4" /> Discover Your Path
            </div>
            <h1 className="text-4xl md:text-6xl font-serif font-medium tracking-tight text-[#2D2D2D] leading-tight">
              Bring clarity and harmony into your life journey.
            </h1>
            <p className="text-lg md:text-xl text-[#5A5A5A] font-light leading-relaxed">
              Personalized spiritual guidance, numerology, and Vaastu consultations designed to align your energy and create real transformation.
            </p>
            <div className="pt-4 flex flex-col sm:flex-row gap-4">
              <Link to="/book">
                <Button size="lg" className="w-full sm:w-auto text-base">Book Consultation</Button>
              </Link>
              <Link to="/#services">
                <Button variant="outline" size="lg" className="w-full sm:w-auto text-base bg-white/50 backdrop-blur-sm">Explore Services</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="py-24 bg-white">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-16">
            <div className="w-full lg:w-1/2 flex justify-center">
              <div className="relative w-4/5 sm:w-4/5 md:w-3/4 lg:w-4/5">
                <div className="absolute -inset-4 bg-[#8E7CC3]/10 rounded-3xl transform rotate-3" />
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1566169825712-6c8ba3dd9027?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwcm9mZXNzaW9uYWwlMjBzcGlyaXR1YWwlMjB3b21hbiUyMHBvcnRyYWl0fGVufDF8fHx8MTc3ODU4MjA5M3ww&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Suma portrait"
                  className="w-full aspect-[4/5] object-cover rounded-3xl shadow-lg relative z-10"
                />
              </div>
            </div>
            <div className="w-full lg:w-1/2 space-y-6">
              <h2 className="text-3xl md:text-4xl font-serif font-medium text-[#2D2D2D]">Hi, I'm Suma.</h2>
              <div className="w-12 h-1 bg-[#C5A880] rounded-full" />
              <div className="space-y-4 text-lg text-[#5A5A5A] font-light leading-relaxed">
                <p>
                  I guide individuals and families to bring harmony into their lives using Numerology and Vaastu principles.
                </p>
                <p>
                  With a deep interest in energy alignment, along with my journey in Reiki and Yoga, I help you make practical changes that create real transformation. My approach is personal, deeply rooted in traditional wisdom, and tailored to your unique modern lifestyle.
                </p>
                <p>
                  Let's work together to unlock the potential within you and your surroundings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="services" className="py-24 bg-[#FAF9F6]">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-serif font-medium text-[#2D2D2D] mb-4">My Services</h2>
            <p className="text-[#7A7A7A] text-lg">Holistic consultations to realign your space, numbers, and personal energy.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Service 1 */}
            <Card className="hover:-translate-y-2 transition-transform duration-300 border-none shadow-md overflow-hidden group flex flex-col h-full">
              <div className="h-48 overflow-hidden">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1638864616266-c390568f9092?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxudW1iZXJzJTIwc2FjcmVkJTIwZ2VvbWV0cnklMjBtaW5pbWFsfGVufDF8fHx8MTc3ODU4MjA5M3ww&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Numerology"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <CardHeader className="flex-grow pb-4">
                <div className="w-12 h-12 bg-[#FAF9F6] rounded-full flex items-center justify-center mb-4 text-[#8E7CC3]">
                  <Compass className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl mb-2">Numerology</CardTitle>
                <CardDescription className="text-base">
                  Discover how numbers influence your life path, relationships, and career. Get personalized remedies for balancing numeric energies.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-8 mt-auto">
                <Link to="/book" className="text-[#C5A880] font-medium flex items-center hover:text-[#B39670] transition-colors">
                  Book Session <span className="ml-2">→</span>
                </Link>
              </CardContent>
            </Card>

            {/* Service 2 */}
            <Card className="hover:-translate-y-2 transition-transform duration-300 border-none shadow-md overflow-hidden group flex flex-col h-full">
              <div className="h-48 overflow-hidden">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1759310707368-e36f321b3187?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYXJjaGl0ZWN0dXJlJTIwaW50ZXJpb3IlMjB6ZW58ZW58MXx8fHwxNzc4NTgyMDkzfDA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Vaastu"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <CardHeader className="flex-grow pb-4">
                <div className="w-12 h-12 bg-[#FAF9F6] rounded-full flex items-center justify-center mb-4 text-[#8E7CC3]">
                  <Sparkles className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl mb-2">Vaastu Consultation</CardTitle>
                <CardDescription className="text-base">
                  Align your home or workspace with positive energy flow using practical, modern architectural remedies based on ancient wisdom.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-8 mt-auto">
                <Link to="/book" className="text-[#C5A880] font-medium flex items-center hover:text-[#B39670] transition-colors">
                  Book Session <span className="ml-2">→</span>
                </Link>
              </CardContent>
            </Card>

            {/* Service 3 */}
            <Card className="hover:-translate-y-2 transition-transform duration-300 border-none shadow-md overflow-hidden group flex flex-col h-full">
              <div className="h-48 overflow-hidden">
                <ImageWithFallback
                  src="https://images.unsplash.com/photo-1664464683199-1b117efc42f2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx0ZWElMjBoYW5kcyUyMHRhbGtpbmclMjB0aGVyYXB5JTIwbWluaW1hbHxlbnwxfHx8fDE3Nzg1ODIwOTR8MA&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Guidance"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <CardHeader className="flex-grow pb-4">
                <div className="w-12 h-12 bg-[#FAF9F6] rounded-full flex items-center justify-center mb-4 text-[#8E7CC3]">
                  <Heart className="w-6 h-6" />
                </div>
                <CardTitle className="text-xl mb-2">Personalized Guidance</CardTitle>
                <CardDescription className="text-base">
                  A holistic approach blending reiki, mindfulness, and intuitive counseling to help you navigate life's challenges with grace.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 pb-8 mt-auto">
                <Link to="/book" className="text-[#C5A880] font-medium flex items-center hover:text-[#B39670] transition-colors">
                  Book Session <span className="ml-2">→</span>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why Choose Me */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-serif font-medium text-[#2D2D2D] mb-4">Why Choose Me</h2>
            <p className="text-[#7A7A7A] text-lg">A nurturing environment for authentic growth and harmony.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: UserCheck, title: "Personalized Solutions", desc: "Tailored to your specific life situation." },
              { icon: Compass, title: "Practical Remedies", desc: "Easy to implement in modern daily life." },
              { icon: Heart, title: "Holistic Approach", desc: "Mind, body, and spiritual environment." },
              { icon: BookOpen, title: "Confidential Guidance", desc: "A safe and private space to open up." }
            ].map((feature, i) => (
              <div key={i} className="flex flex-col items-center text-center p-6 rounded-3xl bg-[#FAF9F6] border border-[#E6E2F3]/50">
                <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center text-[#C5A880] shadow-sm mb-6">
                  <feature.icon className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-medium text-[#2D2D2D] mb-2">{feature.title}</h4>
                <p className="text-[#7A7A7A]">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-24 bg-[#E6E2F3]/20">
        <div className="container mx-auto px-4 md:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-serif font-medium text-[#2D2D2D] mb-4">Client Stories</h2>
            <p className="text-[#7A7A7A] text-lg">Hear from those who have walked the path to harmony.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((item) => (
              <Card key={item} className="border-none shadow-md bg-white p-8 rounded-3xl relative">
                <Quote className="absolute top-8 right-8 w-12 h-12 text-[#E6E2F3]/50" />
                <div className="flex text-[#C5A880] mb-6">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                </div>
                <p className="text-[#5A5A5A] italic mb-8 relative z-10">
                  "Suma's guidance completely transformed the energy in our home. The practical Vaastu remedies were easy to implement and brought immediate peace to our family."
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#FAF9F6] rounded-full flex items-center justify-center text-[#8E7CC3] font-serif text-xl">
                    S
                  </div>
                  <div>
                    <h5 className="font-medium text-[#2D2D2D]">Sarah M.</h5>
                    <p className="text-sm text-[#7A7A7A]">Homeowner</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Blog Preview Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-4 md:px-8">
          <div className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-serif font-medium text-[#2D2D2D] mb-2">Latest Insights</h2>
              <p className="text-[#7A7A7A] text-lg">Wisdom for your daily life.</p>
            </div>
            <Button variant="ghost" className="hidden sm:flex">View all articles</Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              "Best Numbers for Baby Names",
              "Common Vaastu Mistakes in Modern Homes",
              "How Your Name Affects Your Destiny"
            ].map((title, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="h-56 bg-[#FAF9F6] rounded-3xl mb-4 overflow-hidden">
                  <div className="w-full h-full bg-[#E6E2F3]/30 flex items-center justify-center text-[#8E7CC3] group-hover:bg-[#E6E2F3]/50 transition-colors">
                    <BookOpen className="w-12 h-12 opacity-50" />
                  </div>
                </div>
                <div className="flex gap-2 text-sm text-[#C5A880] mb-2 font-medium">
                  <span>Numerology</span> • <span>5 min read</span>
                </div>
                <h4 className="text-xl font-medium text-[#2D2D2D] group-hover:text-[#8E7CC3] transition-colors line-clamp-2">
                  {title}
                </h4>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-[#8E7CC3] text-white">
        <div className="container mx-auto px-4 md:px-8 text-center max-w-3xl">
          <h2 className="text-3xl md:text-5xl font-serif font-medium mb-6">Ready to Transform Your Life?</h2>
          <p className="text-white/80 text-lg md:text-xl mb-10 font-light">
            Take the first step towards a more harmonious and balanced life. Book your personalized consultation today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/book">
              <Button size="lg" className="bg-white text-[#8E7CC3] hover:bg-white/90 text-lg w-full sm:w-auto h-14 px-8">
                Book Consultation
              </Button>
            </Link>
            <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 text-lg w-full sm:w-auto h-14 px-8">
              Message on WhatsApp
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
