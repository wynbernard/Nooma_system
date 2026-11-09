import { useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  MapPin,
  Clock,
  Phone,
  Send,
  CheckCircle2,
  Compass,
  ArrowUpRight,
} from "lucide-react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const formatPeso = (n: number) => `₱${Number(n).toLocaleString("en-PH")}`;

/* ==========================================================================
   MENU DATA WITH IMAGES & DESCRIPTIONS
   ========================================================================== */

const MENU_CATEGORIES = [
  { id: "tasting", label: "Tasting Menu & Mains" },
  { id: "cellar", label: "Wine & Spirits" },
  { id: "desserts", label: "Artisanal Desserts" },
] as const;

const MENU_ITEMS = {
  tasting: [
    {
      id: "wagyu-tenderloin",
      name: "A5 Miyazaki Wagyu Tenderloin",
      description:
        "Charcoal-grilled over local fruitwood, bone marrow jus, roasted heirloom carrots, Périgord truffle butter.",
      price: 3800,
      badge: "Signature",
      image:
        "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
    },
    {
      id: "muscovy-duck",
      name: "Pan-Seared Muscovy Duck Breast",
      description:
        "Aged Negros sugarcane glaze, smoked parsnip puree, fermented mulberry reduction, crispy skin crumble.",
      price: 1950,
      badge: "Chef's Pick",
      image:
        "https://images.unsplash.com/photo-1514944288352-fffac99f0bdf?auto=format&fit=crop&w=800&q=80",
    },
    {
      id: "sea-bass",
      name: "Chilean Sea Bass in Yuzu Dashi",
      description:
        "Pan-roasted sea bass, charred baby leeks, sea grape caviars, ginger infusion oil.",
      price: 2450,
      badge: null,
      image:
        "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?auto=format&fit=crop&w=800&q=80",
    },
    {
      id: "black-truffle-pasta",
      name: "Hand-Rolled Tajarin & Périgord Truffle",
      description:
        "Artisanal egg yolk pasta, 36-month Parmigiano-Reggiano cream, freshly shaved winter black truffle.",
      price: 1680,
      badge: "Vegetarian",
      image:
        "https://images.unsplash.com/photo-1621996346565-e3d5d6281313?auto=format&fit=crop&w=800&q=80",
    },
  ],
  cellar: [
    {
      id: "dom-perignon",
      name: "Dom Pérignon Vintage 2012",
      description:
        "Champagne, France — Notes of toasted brioche, white peach, subtle smoky finish. Perfect operational pairing.",
      price: 18500,
      badge: "Sommelier Selection",
      image:
        "https://images.unsplash.com/photo-1569919659476-f0852f6834b7?auto=format&fit=crop&w=800&q=80",
    },
    {
      id: "opus-one",
      name: "Opus One Napa Valley 2018",
      description:
        "Bordeaux Blend, California — Layers of cassis, blackberry, espresso, and silky structured tannins.",
      price: 24000,
      badge: "Rare Vintage",
      image:
        "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80",
    },
    {
      id: "yuzu-spritz",
      name: "Clarified Yuzu & Japanese Gin Spritz",
      description:
        "Roku Gin, cold-pressed yuzu, champagne reduction, sparkling soda, fresh botanical sprig.",
      price: 680,
      badge: "Craft Cocktail",
      image:
        "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
    },
  ],
  desserts: [
    {
      id: "valrhona-tart",
      name: "Valrhona 70% Dark Chocolate Tart",
      description:
        "Smoked sea salt caramel, single-origin cacao nibs, hand-churned vanilla bean gelato.",
      price: 580,
      badge: "House Favorite",
      image:
        "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80",
    },
    {
      id: "mango-pavlova",
      name: "Guimaras Mango & Passionfruit Pavlova",
      description:
        "Light crisp meringue, whipped coconut mascarpone, kalamansi gel, fresh edible blossoms.",
      price: 490,
      badge: "Seasonal",
      image:
        "https://images.unsplash.com/photo-1587314168485-3236d6710814?auto=format&fit=crop&w=800&q=80",
    },
  ],
};

/* ==========================================================================
   MAIN COMPONENT
   ========================================================================== */

type InquiryFormState = {
  name: string;
  email: string;
  phone: string;
  message: string;
  inquiryType: string;
};

export default function App() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] =
    useState<keyof typeof MENU_ITEMS>("tasting");
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    remember: false,
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [inquiryForm, setInquiryForm] = useState<InquiryFormState>({
    name: "",
    email: "",
    phone: "",
    message: "",
    inquiryType: "General Reservation",
  });
  const [toastMessage, setToastMessage] = useState("");

  const handleInquirySubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setToastMessage("Thank you. Your inquiry has been sent to our concierge.");
    setInquiryForm({
      name: "",
      email: "",
      phone: "",
      message: "",
      inquiryType: "General Reservation",
    });
    setTimeout(() => setToastMessage(""), 4000);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleLoginSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const response = await fetch("../backend/login/login.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: formData.username,
          password: formData.password,
          remember: formData.remember,
        }),
      });

      const result = await response.json();

      if (
        response.ok &&
        result.success &&
        result.user?.username &&
        result.user?.role
      ) {
        sessionStorage.setItem("nooma_username", result.user.username);
        sessionStorage.setItem("nooma_role", result.user.role);
        setFormData({ username: "", password: "", remember: false });
        setIsLoginOpen(false);
        navigate("/dashboard", { replace: true });
      } else {
        setErrorMsg(result.message || "Invalid credentials provided.");
      }
    } catch (err) {
      console.error("Login request error:", err);
      setErrorMsg("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#111111] font-sans antialiased selection:bg-[#C5A880]/20 selection:text-[#111111]">
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111111]/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-[#EAE6DF] bg-[#FBF9F5] p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-[#C5A880]">
                  Welcome back
                </p>
                <h3 className="mt-2 font-serif text-2xl text-[#111111]">
                  Log In
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsLoginOpen(false)}
                disabled={loading}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-[#EAE6DF] bg-[#F2ECE3] text-sm text-[#111111] transition-colors hover:bg-[#EAE6DF] disabled:opacity-50"
                aria-label="Close login modal"
              >
                ×
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-[#7A6F62]">
                  Username / Email
                </label>
                <input
                  type="text"
                  name="username"
                  required
                  disabled={loading}
                  value={formData.username}
                  onChange={handleChange}
                  placeholder="admin@nooma.com or username"
                  className="w-full rounded-2xl border border-[#DCD5C9] bg-[#F9F7F2] px-4 py-3 text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-[#7A6F62]">
                  Password
                </label>
                <input
                  type="password"
                  name="password"
                  required
                  disabled={loading}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  className="w-full rounded-2xl border border-[#DCD5C9] bg-[#F9F7F2] px-4 py-3 text-xs text-[#111111] focus:border-[#111111] focus:outline-none disabled:opacity-50"
                />
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 text-[10px] uppercase tracking-[0.2em] text-[#7A6F62]">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    name="remember"
                    disabled={loading}
                    checked={formData.remember}
                    onChange={handleChange}
                    className="h-3.5 w-3.5 accent-[#111111]"
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  disabled={loading}
                  className="font-medium text-[#111111] hover:text-[#333333] disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-[#111111] px-4 py-3 text-[10px] font-medium uppercase tracking-[0.2em] text-[#FBF9F5] transition-colors hover:bg-[#333333] disabled:opacity-50"
              >
                {loading ? "Authenticating..." : "Log In"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#111111] text-[#FBF9F5] text-xs px-5 py-3 rounded-full shadow-lg flex items-center gap-3 border border-[#333333] transition-all animate-in fade-in slide-in-from-bottom-3">
          <CheckCircle2 className="w-4 h-4 text-[#C5A880]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ------------------------------------------------------------------
         NAVIGATION HEADER
         ------------------------------------------------------------------ */}
      <header className="sticky top-0 z-40 bg-[#FBF9F5]/90 backdrop-blur-md border-b border-[#EAE6DF]">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <a href="#top" className="flex flex-col">
            <span className="font-serif text-2xl font-semibold tracking-widest text-[#111111] uppercase flex items-center gap-1.5">
              NOOMA{" "}
              <span className="w-1.5 h-1.5 rounded-full bg-[#C5A880] inline-block"></span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.25em] text-[#8C8275] -mt-1 font-medium">
              Fine Dining & Bar
            </span>
          </a>

          <nav className="hidden md:flex items-center gap-8 text-xs font-medium uppercase tracking-widest text-[#665E54]">
            <a href="#about" className="hover:text-[#111111] transition-colors">
              About Us
            </a>
            <a href="#menu" className="hover:text-[#111111] transition-colors">
              Culinary Menu
            </a>
            <a
              href="#contact"
              className="hover:text-[#111111] transition-colors"
            >
              Contact & Hours
            </a>
          </nav>

          <button
            type="button"
            onClick={() => setIsLoginOpen(true)}
            className="px-5 py-2.5 rounded-full text-xs font-medium bg-[#111111] text-[#FBF9F5] hover:bg-[#333333] transition-colors shadow-sm uppercase tracking-widest"
          >
            Log In
          </button>
        </div>
      </header>

      {/* ------------------------------------------------------------------
         1. HERO & ABOUT SECTION WITH PHOTOGRAPHY
         ------------------------------------------------------------------ */}
      <section
        id="about"
        className="relative py-16 lg:py-24 border-b border-[#EAE6DF]"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-5 space-y-6">
              <span className="text-xs font-medium uppercase tracking-[0.25em] text-[#C5A880] flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> Culina & Cellar
              </span>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl text-[#111111] font-normal leading-[1.15]">
                Where Local Terroir Meets Modern Mastery
              </h1>

              <p className="text-sm text-[#665E54] font-light leading-relaxed">
                Nestled in the heart of Bacolod City,{" "}
                <strong>Nooma Fine Dining & Bar</strong> redefines regional
                gastronomy. Our culinary philosophy celebrates wood-fired
                heirloom techniques, hyper-seasonal Western Visayan ingredients,
                and an internationally acclaimed wine cellar.
              </p>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-[#EAE6DF]">
                <div>
                  <h4 className="font-serif text-2xl text-[#111111]">100%</h4>
                  <p className="text-xs text-[#8C8275] font-light mt-0.5">
                    Sourced from local farms & artisanal fisheries
                  </p>
                </div>
                <div>
                  <h4 className="font-serif text-2xl text-[#111111]">150+</h4>
                  <p className="text-xs text-[#8C8275] font-light mt-0.5">
                    Curated international vintages & spirits
                  </p>
                </div>
              </div>
            </div>

            {/* Right Photo Gallery Grid */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="relative group overflow-hidden rounded-3xl border border-[#EAE6DF]">
                <img
                  src="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80"
                  alt="Nooma Luxury Dining Room Atmosphere"
                  className="w-full h-80 sm:h-96 object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#111111]/70 via-transparent to-transparent flex items-end p-6">
                  <div className="text-[#FBF9F5]">
                    <span className="text-[10px] uppercase tracking-widest text-[#C5A880] font-medium block">
                      Interior Elegance
                    </span>
                    <h3 className="font-serif text-lg font-normal">
                      Main Dining Hall & Lounge
                    </h3>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="relative group overflow-hidden rounded-3xl border border-[#EAE6DF]">
                  <img
                    src="https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?auto=format&fit=crop&w=800&q=80"
                    alt="Chef Kitchen Preparation"
                    className="w-full h-40 sm:h-44 object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111111]/60 via-transparent to-transparent flex items-end p-4">
                    <span className="text-xs text-[#FBF9F5] font-serif">
                      Open Wood-Fired Kitchen
                    </span>
                  </div>
                </div>

                <div className="relative group overflow-hidden rounded-3xl border border-[#EAE6DF]">
                  <img
                    src="https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?auto=format&fit=crop&w=800&q=80"
                    alt="Wine Cellar Collection"
                    className="w-full h-40 sm:h-48 object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111111]/60 via-transparent to-transparent flex items-end p-4">
                    <span className="text-xs text-[#FBF9F5] font-serif">
                      Private Sommelier Wine Vault
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
         2. PRODUCT / MENU SHOWCASE WITH CARDS & PRICING
         ------------------------------------------------------------------ */}
      <section id="menu" className="py-16 lg:py-24 border-b border-[#EAE6DF]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>
              <span className="text-xs font-medium uppercase tracking-[0.25em] text-[#C5A880] block mb-2">
                Seasonal Offerings
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl text-[#111111] font-normal">
                Curated Culinary Selections
              </h2>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-2 bg-[#F2ECE3] p-1.5 rounded-full border border-[#E6DFD3] self-start md:self-auto overflow-x-auto max-w-full">
              {MENU_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "px-5 py-2 rounded-full text-xs font-medium whitespace-nowrap transition-all uppercase tracking-wider",
                    activeCategory === cat.id
                      ? "bg-[#111111] text-[#FBF9F5] shadow-sm"
                      : "text-[#665E54] hover:text-[#111111]",
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {MENU_ITEMS[activeCategory].map((item) => (
              <div
                key={item.id}
                className="bg-[#FBF9F5] rounded-3xl border border-[#EAE6DF] overflow-hidden shadow-sm hover:border-[#D8D0C3] transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="relative h-56 overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    {item.badge && (
                      <span className="absolute top-4 right-4 bg-[#111111]/90 text-[#FBF9F5] text-[10px] uppercase tracking-widest px-3 py-1 rounded-full backdrop-blur-sm border border-[#333333]">
                        {item.badge}
                      </span>
                    )}
                  </div>

                  <div className="p-6 space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <h3 className="font-serif text-xl text-[#111111] font-medium leading-snug">
                        {item.name}
                      </h3>
                    </div>
                    <p className="text-xs text-[#665E54] font-light leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="px-6 pb-6 pt-2 flex items-center justify-between border-t border-[#F2ECE3]">
                  <span className="font-serif text-xl font-normal text-[#111111]">
                    {formatPeso(item.price)}
                  </span>
                  <span className="text-[11px] text-[#8C8275] uppercase tracking-wider font-medium">
                    Order at Table
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
         3. CONTACT & LOCATION DETAIL SECTION
         ------------------------------------------------------------------ */}
      <section id="contact" className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            {/* Contact Details & Info */}
            <div className="lg:col-span-5 space-y-8">
              <div>
                <span className="text-xs font-medium uppercase tracking-[0.25em] text-[#C5A880] block mb-2">
                  Visit & Connect
                </span>
                <h2 className="font-serif text-3xl sm:text-4xl text-[#111111] font-normal">
                  Location & Concierge
                </h2>
                <p className="text-xs text-[#665E54] font-light mt-2">
                  For private dining events, wine pairings, or table inquiries.
                </p>
              </div>

              {/* Hours Card */}
              <div className="bg-[#F2ECE3] p-6 rounded-3xl border border-[#E6DFD3] space-y-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-[#C5A880]" />
                  <h4 className="font-serif text-lg text-[#111111]">
                    Operating Hours
                  </h4>
                </div>
                <div className="space-y-2 text-xs text-[#595248]">
                  <div className="flex justify-between">
                    <span>Lunch Service</span>
                    <span className="font-medium text-[#111111]">
                      11:30 AM – 2:30 PM
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dinner Service</span>
                    <span className="font-medium text-[#111111]">
                      6:00 PM – 10:30 PM
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#DCD5C9]">
                    <span>Bar & Lounge</span>
                    <span className="font-medium text-[#111111]">
                      Until 12:00 Midnight
                    </span>
                  </div>
                </div>
              </div>

              {/* Address Card */}
              <div className="space-y-4 text-xs">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-[#F2ECE3] rounded-2xl border border-[#E6DFD3]">
                    <MapPin className="w-5 h-5 text-[#C5A880]" />
                  </div>
                  <div>
                    <h5 className="font-medium text-sm text-[#111111]">
                      Location Address
                    </h5>
                    <p className="text-[#665E54] font-light mt-1">
                      Nooma Culinary Estate, Lacson Street, Bacolod City, 6100
                      Negros Occidental, Philippines
                    </p>
                    <span className="text-[10px] text-[#C5A880] font-medium uppercase tracking-wider block mt-1">
                      Valet Parking Available
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="p-3 bg-[#F2ECE3] rounded-2xl border border-[#E6DFD3]">
                    <Phone className="w-5 h-5 text-[#C5A880]" />
                  </div>
                  <div>
                    <h5 className="font-medium text-sm text-[#111111]">
                      Direct Reservations
                    </h5>
                    <p className="text-[#665E54] font-light">
                      +63 (034) 709 8888 / +63 917 555 0192
                    </p>
                  </div>
                </div>
              </div>

              {/* Map Preview Card */}
              <div className="relative rounded-3xl overflow-hidden border border-[#EAE6DF] h-48 group">
                <img
                  src="https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=800&q=80"
                  alt="Bacolod City Map Location Placeholder"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 filter contrast-75 brightness-90"
                />
                <div className="absolute inset-0 bg-[#111111]/30 flex items-center justify-center p-4">
                  <div className="bg-[#FBF9F5] px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-xs text-[#111111]">
                    <Compass className="w-4 h-4 text-[#C5A880]" />
                    <span>Open in Google Maps</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#8C8275]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Contact Inquiry Form */}
            <div className="lg:col-span-7 bg-[#FBF9F5] p-8 sm:p-10 rounded-3xl border border-[#EAE6DF] shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-serif text-2xl text-[#111111] font-normal mb-2">
                  Send an Inquiry
                </h3>
                <p className="text-xs text-[#665E54] font-light mb-8">
                  Fill out your details below and our reservations manager will
                  respond within 2 hours.
                </p>

                <form onSubmit={handleInquirySubmit} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-medium text-[#7A6F62] block mb-1.5 uppercase tracking-wider">
                        Full Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Maria Santos"
                        value={inquiryForm.name}
                        onChange={(e) =>
                          setInquiryForm({
                            ...inquiryForm,
                            name: e.target.value,
                          })
                        }
                        className="w-full bg-[#F9F7F2] border border-[#DCD5C9] rounded-2xl px-4 py-3 text-xs text-[#111111] focus:outline-none focus:border-[#111111]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-[#7A6F62] block mb-1.5 uppercase tracking-wider">
                        Email Address
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="maria@example.com"
                        value={inquiryForm.email}
                        onChange={(e) =>
                          setInquiryForm({
                            ...inquiryForm,
                            email: e.target.value,
                          })
                        }
                        className="w-full bg-[#F9F7F2] border border-[#DCD5C9] rounded-2xl px-4 py-3 text-xs text-[#111111] focus:outline-none focus:border-[#111111]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-xs font-medium text-[#7A6F62] block mb-1.5 uppercase tracking-wider">
                        Contact Phone
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+63 900 000 0000"
                        value={inquiryForm.phone}
                        onChange={(e) =>
                          setInquiryForm({
                            ...inquiryForm,
                            phone: e.target.value,
                          })
                        }
                        className="w-full bg-[#F9F7F2] border border-[#DCD5C9] rounded-2xl px-4 py-3 text-xs text-[#111111] focus:outline-none focus:border-[#111111]"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-[#7A6F62] block mb-1.5 uppercase tracking-wider">
                        Inquiry Type
                      </label>
                      <select
                        value={inquiryForm.inquiryType}
                        onChange={(e) =>
                          setInquiryForm({
                            ...inquiryForm,
                            inquiryType: e.target.value,
                          })
                        }
                        className="w-full bg-[#F9F7F2] border border-[#DCD5C9] rounded-2xl px-4 py-3 text-xs text-[#111111] focus:outline-none focus:border-[#111111]"
                      >
                        <option value="General Reservation">
                          General Reservation
                        </option>
                        <option value="Private Tasting Cellar">
                          Private Tasting Cellar Event
                        </option>
                        <option value="Dietary & Special Requests">
                          Dietary & Special Requests
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[#7A6F62] block mb-1.5 uppercase tracking-wider">
                      Message or Special Notes
                    </label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Please let us know your preferred date, party size, or dietary preferences..."
                      value={inquiryForm.message}
                      onChange={(e) =>
                        setInquiryForm({
                          ...inquiryForm,
                          message: e.target.value,
                        })
                      }
                      className="w-full bg-[#F9F7F2] border border-[#DCD5C9] rounded-2xl px-4 py-3 text-xs text-[#111111] focus:outline-none focus:border-[#111111]"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 rounded-full bg-[#111111] text-[#FBF9F5] text-xs font-medium uppercase tracking-widest hover:bg-[#333333] transition-colors flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5 text-[#C5A880]" />
                    <span>Submit Inquiry</span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[#EAE6DF] py-10 bg-[#F2ECE3]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="font-serif text-lg font-semibold tracking-widest text-[#111111] uppercase">
              NOOMA
            </span>
            <span className="text-xs text-[#8C8275]">
              | Bacolod City, Philippines
            </span>
          </div>

          <div className="text-xs text-[#7A6F62] font-light">
            © {new Date().getFullYear()} Nooma Fine Dining & Bar. All rights
            reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
