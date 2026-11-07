import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, BadgeCheck, BarChart3, Check, ChevronRight,
  CircleHelp, Download, FileText, Heart, House, MapPin, Pencil, Plus, Search, ShieldCheck,
  Smartphone, Sparkles, Trash2, Users, X,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, downloadCsv } from "./api";
import { useAuth } from "./auth";
import type { Analytics, HistoryEntry, Household, Member, User } from "./types";

const chartColors = ["#16877c", "#e7a65a", "#6481c4", "#e27664", "#9d82c7", "#54a3ae"];
const emptyAnalytics: Analytics = {
  total_households: 0, total_population: 0, male_population: 0, female_population: 0,
  other_population: 0, average_family_size: 0, registered_areas: 0,
  gender_distribution: [], male_female: [], age_distribution: [], area_population: [],
  household_size_distribution: [], population_growth: [], matching_households: 0,
};

function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? "notice-error" : ""}`}>{error ? <CircleHelp size={17} /> : <Check size={17} />}{children}</div>;
}

function ErrorNotice({ message }: { message: string }) {
  return message ? <Notice error>{message}</Notice> : null;
}

function StatCard({ label, value, note, icon: Icon, tone = "teal" }: { label: string; value: string | number; note: string; icon: typeof Users; tone?: string }) {
  return <div className="stat-card"><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div><div className={`stat-icon ${tone}`}><Icon size={20} /></div></div>;
}

function useLocations() {
  const [locations, setLocations] = useState<{ states: string[]; districts: string[]; cities: string[]; wards: string[]; localities: string[] }>({
    states: [], districts: [], cities: [], wards: [], localities: [],
  });
  useEffect(() => {
    api<typeof locations>("/public/locations").then(setLocations).catch(() => undefined);
  }, []);
  return locations;
}

function useAnalytics(params: URLSearchParams) {
  const [data, setData] = useState<Analytics>(emptyAnalytics);
  const [error, setError] = useState("");
  const query = params.toString();
  const refresh = useCallback(async () => {
    try {
      setData(await api<Analytics>(`/public/analytics${query ? `?${query}` : ""}`));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load population statistics");
    }
  }, [query]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  return { data, error, refresh };
}

function FilterBar({ values, onChange }: { values: Record<string, string>; onChange: (key: string, value: string) => void }) {
  const locations = useLocations();
  const fields: { key: string; label: string; options: string[] }[] = [
    { key: "state", label: "State", options: locations.states },
    { key: "district", label: "District", options: locations.districts },
    { key: "city_village", label: "City / village", options: locations.cities },
    { key: "ward", label: "Ward", options: locations.wards },
    { key: "locality", label: "Locality", options: locations.localities },
  ];
  return <div className="filter-bar">{fields.map((field) => <label key={field.key}><span>{field.label}</span><select value={values[field.key] ?? ""} onChange={(event) => onChange(field.key, event.target.value)}><option value="">All {field.label.toLowerCase()}s</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select></label>)}
    <label><span>Gender</span><select value={values.gender ?? ""} onChange={(event) => onChange("gender", event.target.value)}><option value="">All genders</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
    <label><span>Age group</span><select value={values.age_group ?? ""} onChange={(event) => onChange("age_group", event.target.value)}><option value="">All ages</option>{["0-14", "15-24", "25-44", "45-64", "65+", "Unknown"].map((item) => <option key={item}>{item}</option>)}</select></label>
  </div>;
}

function ChartPanel({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: ReactNode; className?: string }) {
  return <section className={`panel chart-panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}

function DashboardCharts({ data }: { data: Analytics }) {
  return <div className="charts-grid">
    <ChartPanel title="Male vs female population" subtitle="Current registered residents">
      <div className="chart-wrap chart-medium"><ResponsiveContainer><PieChart><Pie data={data.male_female} dataKey="value" nameKey="name" innerRadius={56} outerRadius={83} paddingAngle={4} stroke="none">{data.male_female.map((_, index) => <Cell key={index} fill={chartColors[index]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" height={28} /></PieChart></ResponsiveContainer></div>
      <div className="chart-center-label"><b>{data.male_population + data.female_population}</b><span>people</span></div>
    </ChartPanel>
    <ChartPanel title="Gender distribution" subtitle="Including other and unspecified">
      <div className="chart-wrap chart-medium"><ResponsiveContainer><PieChart><Pie data={data.gender_distribution} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={3} stroke="none">{data.gender_distribution.map((_, index) => <Cell key={index} fill={chartColors[index]} />)}</Pie><Tooltip /><Legend verticalAlign="bottom" height={28} /></PieChart></ResponsiveContainer></div>
    </ChartPanel>
    <ChartPanel title="Population by age" subtitle="Age groups among active members" className="wide-chart">
      <div className="chart-wrap chart-wide"><ResponsiveContainer><BarChart data={data.age_distribution} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" name="People" fill="#16877c" radius={[6, 6, 0, 0]} barSize={34} /></BarChart></ResponsiveContainer></div>
    </ChartPanel>
    <ChartPanel title="Area-wise population" subtitle="Top localities by active population" className="wide-chart">
      <div className="chart-wrap chart-wide"><ResponsiveContainer><BarChart data={data.area_population} layout="vertical" margin={{ top: 4, right: 16, left: 10, bottom: 0 }}><CartesianGrid horizontal={false} strokeDasharray="3 4" /><XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" width={130} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" name="People" fill="#6481c4" radius={[0, 5, 5, 0]} barSize={17} /></BarChart></ResponsiveContainer></div>
    </ChartPanel>
    <ChartPanel title="Household size" subtitle="Registered household distribution">
      <div className="chart-wrap chart-medium"><ResponsiveContainer><BarChart data={data.household_size_distribution} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="value" name="Households" fill="#e7a65a" radius={[6, 6, 0, 0]} barSize={33} /></BarChart></ResponsiveContainer></div>
    </ChartPanel>
    <ChartPanel title="Population growth" subtitle="Estimated population by month, based on recorded member changes" className="wide-chart">
      <div className="chart-wrap chart-wide"><ResponsiveContainer><LineChart data={data.population_growth} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid vertical={false} strokeDasharray="3 4" /><XAxis dataKey="month" axisLine={false} tickLine={false} /><YAxis allowDecimals={false} axisLine={false} tickLine={false} /><Tooltip /><Line type="monotone" dataKey="population" name="Population" stroke="#16877c" strokeWidth={3} dot={{ r: 4, fill: "#16877c" }} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer></div>
    </ChartPanel>
  </div>;
}

export function LandingPage() {
  const { user } = useAuth();
  const { data } = useAnalytics(new URLSearchParams());
  return <div className="landing-page">
    <header className="landing-nav"><Link to="/" className="brand-lockup"><div className="brand-mark"><BarChart3 size={21} /></div><span>smart<span className="brand-light">census</span><small>COMMUNITY INSIGHTS</small></span></Link><nav><Link to="/dashboard">Population dashboard</Link><a href="#how-it-works">How it works</a><Link to="/login">Sign in</Link><Link className="button button-primary small-button" to={user ? "/citizen" : "/register"}>{user ? "My portal" : "Get started"}<ArrowRight size={15} /></Link></nav></header>
    <section className="hero"><div className="hero-copy"><div className="hero-badge"><span /> COMMUNITY-LED. PRIVACY-FIRST.</div><h1>Better data.<br /><span>Stronger communities.</span></h1><p>A simple, secure way for families to share household information and help communities understand how they are growing.</p><div className="hero-actions"><Link className="button button-primary" to={user ? "/citizen" : "/register"}><Users size={17} /> Register your household <ArrowRight size={16} /></Link><Link className="button button-outline" to="/dashboard"><BarChart3 size={17} /> Explore population data</Link></div><div className="hero-trust"><div className="trust-icons"><ShieldCheck size={17} /><Heart size={16} /></div><span>Your personal details are never shown on the public dashboard.</span></div></div>
      <div className="hero-visual"><div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="hero-data-card"><div className="hero-card-head"><span className="tiny-label">COMMUNITY SNAPSHOT</span><span className="live-status"><i /> Live</span></div><div className="hero-total">{data.total_population.toLocaleString()}<small> residents</small></div><div className="hero-subtitle">Across {data.total_households.toLocaleString()} registered households</div><div className="mini-bars">{[36, 52, 45, 70, 56, 83, 64, 92, 72, 100, 79, 88].map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</div><div className="hero-card-footer"><span><i className="legend-dot teal-dot" /> Male {data.male_population.toLocaleString()}</span><span><i className="legend-dot amber-dot" /> Female {data.female_population.toLocaleString()}</span></div></div><div className="floating-chip chip-one"><span className="chip-icon teal-chip"><Users size={16} /></span><span><b>Families first</b><small>Easy household updates</small></span></div><div className="floating-chip chip-two"><span className="chip-icon gold-chip"><ShieldCheck size={16} /></span><span><b>Your data, protected</b><small>Private by design</small></span></div><div className="hero-decoration decoration-a" /><div className="hero-decoration decoration-b" /></div>
    </section>
    <section className="landing-stats"><div><b>{data.total_households.toLocaleString()}</b><span>registered households</span></div><div><b>{data.total_population.toLocaleString()}</b><span>people represented</span></div><div><b>{data.registered_areas.toLocaleString()}</b><span>registered areas</span></div><div className="stats-note"><ShieldCheck size={18} /><span>Only aggregated statistics are public</span></div></section>
    <section className="how-section" id="how-it-works"><div className="section-heading"><span className="eyebrow">HOW IT WORKS</span><h2>Small steps. A clearer picture.</h2><p>Designed for real families, on any device.</p></div><div className="steps-grid"><div className="step-card"><div className="step-number">01</div><Smartphone size={22} /><h3>Verify your number</h3><p>Sign in securely with a one-time code sent to your mobile phone.</p></div><div className="step-card"><div className="step-number">02</div><House size={22} /><h3>Tell us about home</h3><p>Register your household and add the family members who live there.</p></div><div className="step-card"><div className="step-number">03</div><BarChart3 size={22} /><h3>Keep things current</h3><p>Update your household when life changes. Community totals refresh automatically.</p></div></div></section>
    <section className="landing-cta"><div><Sparkles size={20} /><h2>Every household helps tell the story.</h2><p>Be part of a clearer, more connected picture of your community.</p></div><Link className="button button-white" to={user ? "/citizen" : "/register"}>Get started <ArrowRight size={16} /></Link></section>
    <footer className="landing-footer"><Link to="/" className="footer-brand">smartcensus</Link><span>Independent citizen platform. Not an official government census.</span><Link to="/dashboard">View public dashboard</Link></footer>
  </div>;
}

export function AuthPage({ register = false }: { register?: boolean }) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await api<{ message: string }>("/auth/request-otp", { method: "POST", body: JSON.stringify({ phone }) });
      setCodeSent(true); setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your sign-in code");
    } finally { setBusy(false); }
  };
  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await signIn(phone, code);
      navigate((location.state as { from?: string } | null)?.from ?? "/citizen", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That code could not be verified");
    } finally { setBusy(false); }
  };
  return <div className="auth-page"><Link to="/" className="brand-lockup auth-brand"><div className="brand-mark"><BarChart3 size={21} /></div><span>smart<span className="brand-light">census</span><small>COMMUNITY INSIGHTS</small></span></Link><div className="auth-card"><div className="auth-icon"><Smartphone size={22} /></div><span className="eyebrow">{register ? "CITIZEN REGISTRATION" : "SECURE SIGN IN"}</span><h1>{codeSent ? "Enter your code" : register ? "Create your account" : "Welcome back"}</h1><p>{codeSent ? `A one-time code has been sent to ${phone}.` : "Use your mobile number to securely access your household and community data."}</p>
    {message && <Notice>{message}</Notice>}<ErrorNotice message={error} />
    {!codeSent ? <form onSubmit={requestCode} className="stack-form"><label>Mobile number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" autoComplete="tel" required minLength={8} /></label><small className="form-hint">Include your country code, for example +91 for India.</small><button className="button button-primary button-full" disabled={busy}>{busy ? "Sending…" : "Send one-time code"}<ArrowRight size={16} /></button></form>
      : <form onSubmit={verifyCode} className="stack-form"><label>6-digit verification code<input className="otp-input" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" autoComplete="one-time-code" required /></label><button className="button button-primary button-full" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify and continue"}<ArrowRight size={16} /></button><button type="button" className="text-button" onClick={() => { setCodeSent(false); setCode(""); setMessage(""); }}>Use a different number</button></form>}
    <div className="auth-privacy"><ShieldCheck size={16} /> We only use your number for secure account access.</div></div><div className="auth-footer"><Link to="/">Back to home</Link><span>Independent community platform · Not a government census</span></div></div>;
}

export function DashboardPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const params = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)), [filters]);
  const { data, error } = useAnalytics(params);
  const { user } = useAuth();
  const changeFilter = (key: string, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  return <><PageTitle eyebrow="COMMUNITY OVERVIEW" title="Population dashboard" description="A clear, aggregated view of registered households and community population." action={<span className="refresh-pill"><i /> Updates automatically</span>} />
    <ErrorNotice message={error} /><FilterBar values={filters} onChange={changeFilter} />
    <div className="stats-grid">
      <StatCard label="Registered households" value={data.total_households.toLocaleString()} note="In selected areas" icon={House} />
      <StatCard label="Total population" value={data.total_population.toLocaleString()} note="Active household members" icon={Users} tone="blue" />
      <StatCard label="Male population" value={data.male_population.toLocaleString()} note={`${data.total_population ? Math.round(data.male_population / data.total_population * 100) : 0}% of population`} icon={ArrowUpRight} tone="purple" />
      <StatCard label="Female population" value={data.female_population.toLocaleString()} note={`${data.total_population ? Math.round(data.female_population / data.total_population * 100) : 0}% of population`} icon={ArrowDownRight} tone="amber" />
      <StatCard label="Other / unspecified" value={data.other_population.toLocaleString()} note="Other or undisclosed gender" icon={Users} tone="coral" />
      <StatCard label="Average family size" value={data.average_family_size.toFixed(1)} note="People per household" icon={Heart} tone="green" />
      <StatCard label="Registered areas" value={data.registered_areas.toLocaleString()} note="Distinct localities" icon={MapPin} tone="slate" />
    </div>
    <DashboardCharts data={data} />
    <div className="dashboard-footnote"><ShieldCheck size={16} /><span>All public figures are aggregated. Personal household details are never displayed here.</span><span className="updated-note">Refreshes every 30 seconds</span></div>
    {user && <div className="dashboard-cta"><div><b>Keep your household information up to date</b><span>Accurate updates make community insights more useful.</span></div><Link to="/citizen" className="button button-primary">Go to my portal <ArrowRight size={15} /></Link></div>}
  </>;
}

export function AreasPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const params = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)), [filters]);
  const { data, error } = useAnalytics(params);
  return <><PageTitle eyebrow="GEOGRAPHIC INSIGHTS" title="Area-wise population" description="Explore aggregated population by the registered city, village, and locality." />
    <ErrorNotice message={error} /><FilterBar values={filters} onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))} />
    <div className="area-summary"><div className="area-summary-icon"><MapPin size={20} /></div><div><b>{data.registered_areas} registered areas</b><span>{data.total_population.toLocaleString()} active residents represented in the current selection</span></div><span className="area-disclaimer">Registered submissions only</span></div>
    <div className="panel area-panel"><div className="panel-heading"><div><h2>Population by locality</h2><p>Sorted by the number of active household members</p></div><span className="table-count">{data.area_population.length} areas</span></div>
      {data.area_population.length ? <div className="area-list">{data.area_population.map((item, index) => <div className="area-row" key={item.name}><span className="area-rank">{String(index + 1).padStart(2, "0")}</span><div className="area-name"><MapPin size={16} /><b>{item.name}</b></div><div className="area-bar-track"><i style={{ width: `${Math.max(3, data.area_population[0]?.value ? item.value / data.area_population[0].value * 100 : 0)}%` }} /></div><b className="area-value">{item.value.toLocaleString()}</b><span className="area-unit">people</span></div>)}</div> : <EmptyState title="No area data yet" text="Population by area appears once households have been registered." />}
    </div><div className="privacy-note wide-note"><ShieldCheck size={17} /><span>Public area statistics include totals only, never individual names, phone numbers, or addresses.</span></div></>;
}

export function CitizenPage() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const load = useCallback(async () => {
    try { setHouseholds(await api<Household[]>("/households")); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load your households"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <><PageTitle eyebrow="YOUR PRIVATE SPACE" title={`Hello${user ? `, ${user.phone}` : ""}`} description="Manage your household details and keep your family information current." action={<Link className="button button-primary" to="/households/new"><Plus size={17} /> Register household</Link>} />
    <ErrorNotice message={error} /><div className="portal-banner"><div className="portal-shield"><ShieldCheck size={21} /></div><div><b>Your household, your control</b><span>Only you and the administrators you trust can see your household details.</span></div><Link to="/settings">Privacy &amp; account <ChevronRight size={16} /></Link></div>
    <section className="panel household-panel"><div className="panel-heading"><div><h2>Your households</h2><p>Manage members, update details, or view your change history.</p></div><span className="table-count">{households.length} {households.length === 1 ? "household" : "households"}</span></div>
      {loading ? <LoadingState /> : households.length ? <div className="household-grid">{households.map((household) => <Link className="household-card" to={`/households/${household.id}`} key={household.id}><div className="household-card-top"><div className="house-icon"><House size={20} /></div><span className="member-count">{household.member_count} members</span></div><h3>{household.head_name}</h3><p>{household.city_village}, {household.locality}</p><div className="household-card-footer"><span>{household.household_code}</span><ChevronRight size={17} /></div></Link>)}</div> : <EmptyState title="No household registered yet" text="Add your household profile to start managing family member information." action={<Link className="button button-primary" to="/households/new"><Plus size={16} /> Register your household</Link>} />}
    </section><div className="history-tip"><FileText size={17} /><span>Every household change is recorded in your history so you can review past updates.</span></div></>;
}

const initialHousehold = { head_name: "", mobile: "", state: "", district: "", city_village: "", ward: "", locality: "", address: "", consent: false };

export function HouseholdPage() {
  const { id } = useParams();
  if (!id) return <HouseholdRegistration />;
  return <HouseholdManagerPage householdId={id} />;
}

function HouseholdRegistration() {
  const [form, setForm] = useState(initialHousehold);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const update = (key: keyof typeof initialHousehold, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const household = await api<Household>("/households", { method: "POST", body: JSON.stringify(form) });
      navigate(`/households/${household.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not register household"); }
    finally { setBusy(false); }
  };
  return <><PageTitle eyebrow="HOUSEHOLD REGISTRATION" title="Register your household" description="A few details help us understand your community. Your address and family details stay private." />
    <ErrorNotice message={error} /><form className="panel form-panel household-form" onSubmit={submit}><div className="form-section-title"><span className="form-section-icon"><House size={18} /></span><div><h2>Household details</h2><p>Your household ID will be generated automatically.</p></div></div>
      <div className="form-grid"><label>Head of family name<input required minLength={2} maxLength={160} value={form.head_name} onChange={(event) => update("head_name", event.target.value)} placeholder="Full name" /></label><label>Mobile number<input required minLength={8} maxLength={32} type="tel" value={form.mobile} onChange={(event) => update("mobile", event.target.value)} placeholder="+91 98765 43210" /></label><label>State<input required value={form.state} onChange={(event) => update("state", event.target.value)} placeholder="State" /></label><label>District<input required value={form.district} onChange={(event) => update("district", event.target.value)} placeholder="District" /></label><label>City / village<input required value={form.city_village} onChange={(event) => update("city_village", event.target.value)} placeholder="City or village" /></label><label>Ward number<input required value={form.ward} onChange={(event) => update("ward", event.target.value)} placeholder="Ward" /></label><label>Locality / area<input required value={form.locality} onChange={(event) => update("locality", event.target.value)} placeholder="Locality or neighborhood" /></label><label className="full-field">Full address <span className="private-label"><ShieldCheck size={13} /> Private</span><textarea required minLength={3} maxLength={500} rows={3} value={form.address} onChange={(event) => update("address", event.target.value)} placeholder="Your home address (visible only to authorized users)" /></label></div>
      <label className="consent-row"><input type="checkbox" required checked={form.consent} onChange={(event) => update("consent", event.target.checked)} /><span>I consent to securely storing this household information to support community population statistics. I understand the public dashboard shows aggregated data only.</span></label>
      <div className="form-actions"><Link to="/citizen" className="button button-outline">Cancel</Link><button className="button button-primary" disabled={busy}>{busy ? "Registering…" : "Create household"}<ArrowRight size={16} /></button></div>
    </form></>;
}

const blankMember = { full_name: "", date_of_birth: "", age: "", gender: "prefer_not_to_say", relationship: "", education: "", occupation: "", living_status: "active" };

function HouseholdManagerPage({ householdId }: { householdId: string }) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [form, setForm] = useState(blankMember);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [householdData, memberData, historyData] = await Promise.all([
        api<Household>(`/households/${householdId}`),
        api<Member[]>(`/households/${householdId}/members`),
        api<HistoryEntry[]>(`/households/${householdId}/history`),
      ]);
      setHousehold(householdData); setMembers(memberData); setHistory(historyData); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load this household"); }
  }, [householdId]);
  useEffect(() => { void load(); }, [load]);

  const resetForm = () => { setForm(blankMember); setEditing(null); };
  const submitMember = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const payload = {
      ...form,
      age: form.age === "" ? null : Number(form.age),
      date_of_birth: form.date_of_birth || null,
      education: form.education || null,
      occupation: form.occupation || null,
    };
    try {
      await api(`/households/${householdId}/members${editing ? `/${editing}` : ""}`, {
        method: editing ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      await load(); resetForm(); setNotice(editing ? "Family member details updated." : "Family member added to your household.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save family member"); }
    finally { setBusy(false); }
  };
  const editMember = (member: Member) => {
    setEditing(member.id);
    setForm({
      full_name: member.full_name, date_of_birth: member.date_of_birth ?? "", age: member.age?.toString() ?? "",
      gender: member.gender, relationship: member.relationship, education: member.education ?? "",
      occupation: member.occupation ?? "", living_status: member.living_status,
    });
    window.scrollTo({ top: 450, behavior: "smooth" });
  };
  const removeMember = async (member: Member) => {
    if (!window.confirm(`Remove ${member.full_name} from this household? The change will be preserved in history.`)) return;
    try {
      await api(`/households/${householdId}/members/${member.id}`, { method: "DELETE" });
      await load(); setNotice(`${member.full_name} was removed. The previous record remains in history.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not remove family member"); }
  };
  if (!household && !error) return <LoadingState />;
  return <><PageTitle eyebrow="PRIVATE HOUSEHOLD" title={household?.head_name ?? "Household details"} description={household ? `${household.household_code} · ${household.city_village}, ${household.locality}, ${household.district}` : "Household details are unavailable."} action={<Link to="/citizen" className="button button-outline">Back to portal</Link>} />
    <ErrorNotice message={error} />{notice && <Notice>{notice}</Notice>}
    {household && <><div className="household-detail-stats"><div><span>Current household population</span><b>{household.member_count} <small>members</small></b></div><div><span>Registered on</span><b>{new Date(household.created_at).toLocaleDateString()}</b></div><div><span>Mobile</span><b>{household.mobile}</b></div><div><span>Address</span><b>{household.address}</b></div></div>
      <section className="panel member-panel"><div className="panel-heading"><div><h2>Family members</h2><p>Add or update the people who currently live in this household.</p></div><span className="table-count">{members.length} records</span></div>
        {members.length ? <div className="table-scroll"><table><thead><tr><th>Family member</th><th>Age</th><th>Gender</th><th>Relationship</th><th>Status</th><th>Actions</th></tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><div className="table-person"><div className="avatar small-avatar">{member.full_name.charAt(0).toUpperCase()}</div><div><b>{member.full_name}</b><small>Added {new Date(member.registered_at).toLocaleDateString()}</small></div></div></td><td>{member.date_of_birth ? new Date(`${member.date_of_birth}T00:00:00`).toLocaleDateString() : member.age ?? "—"}</td><td className="capitalize">{member.gender.replaceAll("_", " ")}</td><td>{member.relationship}</td><td><span className={`status-pill ${member.living_status}`}>{member.living_status}</span></td><td><div className="table-actions"><button className="icon-btn" title="Edit member" onClick={() => editMember(member)}><Pencil size={15} /></button><button className="icon-btn danger-icon" title="Remove member" onClick={() => void removeMember(member)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div> : <EmptyState title="No family members added" text="Add your household members below. Population counts update automatically." />}
      </section>
      <section className="panel form-panel member-form-panel"><div className="form-section-title"><span className="form-section-icon"><Users size={18} /></span><div><h2>{editing ? "Update family member" : "Add a family member"}</h2><p>Age or date of birth is required. You can provide either one.</p></div>{editing && <button className="text-button cancel-edit" onClick={resetForm}><X size={15} /> Cancel edit</button>}</div>
        <form onSubmit={submitMember}><div className="form-grid"><label>Full name<input required minLength={2} maxLength={160} value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Full name" /></label><label>Relationship to head<input required value={form.relationship} onChange={(event) => setForm((current) => ({ ...current, relationship: event.target.value }))} placeholder="e.g. Spouse, child" /></label><label>Age in years<input type="number" min="0" max="125" value={form.age} onChange={(event) => setForm((current) => ({ ...current, age: event.target.value }))} placeholder="Age" /></label><label>Date of birth<input type="date" value={form.date_of_birth} onChange={(event) => setForm((current) => ({ ...current, date_of_birth: event.target.value }))} /></label><label>Gender<select value={form.gender} onChange={(event) => setForm((current) => ({ ...current, gender: event.target.value }))}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><label>Living status<select value={form.living_status} onChange={(event) => setForm((current) => ({ ...current, living_status: event.target.value }))}><option value="active">Active</option><option value="deceased">Deceased</option></select></label><label>Education level <span className="optional-label">Optional</span><input value={form.education} onChange={(event) => setForm((current) => ({ ...current, education: event.target.value }))} placeholder="Education level" /></label><label>Occupation <span className="optional-label">Optional</span><input value={form.occupation} onChange={(event) => setForm((current) => ({ ...current, occupation: event.target.value }))} placeholder="Occupation" /></label></div><div className="form-actions"><button type="button" className="button button-outline" onClick={resetForm}>Clear</button><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add member"}{!busy && <Plus size={16} />}</button></div></form>
      </section>
      <section className="panel history-panel"><div className="panel-heading"><div><h2>Household update history</h2><p>Recent changes recorded for your household.</p></div><span className="table-count">{history.length} updates</span></div>{history.length ? <div className="history-list">{history.slice(0, 8).map((entry) => <div className="history-item" key={entry.id}><span className="history-dot" /><div><b>{entry.action} {entry.entity_type}</b><small>{new Date(entry.created_at).toLocaleString()}</small></div><span className="history-id">{entry.entity_id.slice(0, 8)}</span></div>)}</div> : <p className="empty-inline">Changes to your household will appear here.</p>}</section>
    </>}
  </>;
}

export function AdminPage() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [duplicates, setDuplicates] = useState<{ reason: string; households: { id: string; household_code: string; head_name: string }[] }[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const query = search ? `?search=${encodeURIComponent(search)}` : "";
      const [householdData, userData, review] = await Promise.all([
        api<Household[]>(`/admin/households${query}`), api<User[]>("/admin/users"),
        api<{ potential_duplicates: typeof duplicates }>("/admin/review"),
      ]);
      setHouseholds(householdData); setUsers(userData); setDuplicates(review.potential_duplicates); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load administrator data"); }
  }, [search]);
  useEffect(() => { void load(); }, [load]);
  const changeRole = async (account: User, role: "admin" | "citizen") => {
    setBusy(true);
    try {
      await api(`/admin/users/${account.id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update account role"); }
    finally { setBusy(false); }
  };
  const totalMembers = households.reduce((sum, household) => sum + household.member_count, 0);
  return <><PageTitle eyebrow="RESTRICTED WORKSPACE" title="Administrator dashboard" description="Manage registered records, accounts, and review flags. Personal records are visible to administrators only." action={<Link className="button button-outline" to="/reports"><FileText size={16} /> Reports &amp; export</Link>} />
    <ErrorNotice message={error} /><div className="stats-grid admin-stats"><StatCard label="Registered households" value={households.length.toLocaleString()} note="Current search results" icon={House} /><StatCard label="Active population" value={totalMembers.toLocaleString()} note="Current search results" icon={Users} tone="blue" /><StatCard label="Citizen accounts" value={users.length.toLocaleString()} note="Verified mobile accounts" icon={BadgeCheck} tone="purple" /><StatCard label="Potential review flags" value={duplicates.length.toLocaleString()} note="Require human review" icon={ShieldCheck} tone="amber" /></div>
    <div className="coverage-note"><CircleHelp size={18} /><span><b>Coverage tracking:</b> Unregistered households cannot be counted without an authoritative reference list for each area. This dashboard reports registered submissions only.</span></div>
    <section className="panel admin-panel"><div className="panel-heading"><div><h2>Registered households</h2><p>Review submitted household records and their current population.</p></div><label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search household, mobile, area" /></label></div><div className="table-scroll"><table><thead><tr><th>Household</th><th>Area</th><th>Mobile</th><th>Population</th><th>Registered</th></tr></thead><tbody>{households.map((household) => <tr key={household.id}><td><div><b>{household.head_name}</b><small>{household.household_code}</small></div></td><td>{household.city_village}, {household.locality}</td><td>{household.mobile}</td><td>{household.member_count}</td><td>{new Date(household.created_at).toLocaleDateString()}</td></tr>)}{!households.length && <tr><td colSpan={5} className="table-empty">No registered household matches the search.</td></tr>}</tbody></table></div></section>
    <div className="admin-lower-grid"><section className="panel admin-panel"><div className="panel-heading"><div><h2>Account access</h2><p>Manage verified citizen and administrator roles.</p></div></div><div className="table-scroll"><table><thead><tr><th>Mobile number</th><th>Role</th><th>Joined</th><th>Access</th></tr></thead><tbody>{users.map((account) => <tr key={account.id}><td>{account.phone}</td><td><span className={`role-pill ${account.role}`}>{account.role}</span></td><td>{new Date(account.created_at).toLocaleDateString()}</td><td><select disabled={busy} value={account.role} onChange={(event) => void changeRole(account, event.target.value as "citizen" | "admin")}><option value="citizen">Citizen</option><option value="admin">Administrator</option></select></td></tr>)}</tbody></table></div></section>
      <section className="panel review-panel"><div className="panel-heading"><div><h2>Registration review</h2><p>Potential duplicate records to check manually.</p></div><span className="review-count">{duplicates.length}</span></div>{duplicates.length ? <div className="review-list">{duplicates.map((item, index) => <div className="review-item" key={`${item.reason}-${index}`}><div className="review-icon"><CircleHelp size={16} /></div><div><b>{item.reason}</b><span>{item.households.map((household) => `${household.head_name} (${household.household_code})`).join(" · ")}</span></div></div>)}</div> : <div className="review-clear"><ShieldCheck size={23} /><b>No potential duplicates found</b><span>New registrations are checked for repeated phone numbers and locality/address matches.</span></div>}</section></div>
  </>;
}

export function ReportsPage() {
  const [data, setData] = useState<Analytics>(emptyAnalytics);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<Analytics>("/admin/analytics").then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load report summary")); }, []);
  const exportData = async () => {
    setBusy(true); setError("");
    try { await downloadCsv(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not download report"); }
    finally { setBusy(false); }
  };
  return <><PageTitle eyebrow="DATA &amp; REPORTING" title="Reports and export" description="Download registered household and member records for authorized administrative use." />
    <ErrorNotice message={error} /><div className="export-banner"><div className="export-icon"><Download size={23} /></div><div><h2>Full census data export</h2><p>CSV includes household locations and member details. Handle this file as confidential personal data.</p><div className="export-meta"><span><ShieldCheck size={14} /> Administrator access required</span><span><FileText size={14} /> CSV format</span></div></div><button className="button button-primary" onClick={() => void exportData()} disabled={busy}>{busy ? "Preparing…" : "Download CSV"}<Download size={16} /></button></div>
    <div className="report-stats"><StatCard label="Households in register" value={data.total_households.toLocaleString()} note="All registered household records" icon={House} /><StatCard label="Active member records" value={data.total_population.toLocaleString()} note="Excludes deceased and removed members" icon={Users} tone="blue" /><StatCard label="Registered locations" value={data.registered_areas.toLocaleString()} note="Unique location records" icon={MapPin} tone="purple" /></div>
    <section className="panel report-panel"><div className="panel-heading"><div><h2>Data handling</h2><p>Exported records contain sensitive household information.</p></div><ShieldCheck size={20} className="report-shield" /></div><ul className="report-guidelines"><li><Check size={16} /> Download only when needed for an authorized purpose.</li><li><Check size={16} /> Store files securely and do not share with unauthorized people.</li><li><Check size={16} /> Public population figures are available separately on the dashboard.</li><li><Check size={16} /> Exported data reflects current records; update history remains in the application.</li></ul></section>
  </>;
}

export function SettingsPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return <><PageTitle eyebrow="ACCOUNT &amp; PREFERENCES" title="Profile and settings" description="Your verified sign-in profile and privacy controls." />
    <section className="panel settings-card"><div className="settings-person"><div className="large-avatar">{user?.phone.slice(-2)}</div><div><h2>{user?.role === "admin" ? "Administrator account" : "Citizen account"}</h2><span className={`role-pill ${user?.role}`}>{user?.role}</span></div></div><div className="settings-detail"><span>Verified mobile number</span><b>{user?.phone}</b></div><div className="settings-detail"><span>Account created</span><b>{user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</b></div><div className="settings-detail"><span>Access type</span><b>{user?.role === "admin" ? "Administrator access" : "Household manager"}</b></div><div className="settings-privacy"><ShieldCheck size={20} /><div><b>Your privacy matters</b><p>Your phone number and household details are private. Public dashboards display only grouped population statistics.</p></div></div><button className="button button-outline signout-button" onClick={() => { signOut(); navigate("/"); }}>Sign out</button></section>
    <div className="settings-note"><CircleHelp size={17} /><span>To update your mobile number, sign out and verify the new number. Household changes can be managed in your <Link to="/citizen">citizen portal</Link>.</span></div>
  </>;
}

export function NotFoundPage() {
  return <div className="not-found"><div className="not-found-code">404</div><h1>We couldn't find that page</h1><p>The page may have moved or the link may be incorrect.</p><Link to="/" className="button button-primary">Return to Smart Census <ArrowRight size={16} /></Link></div>;
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div><House size={23} /></div><h3>{title}</h3><p>{text}</p>{action}</div>;
}

function LoadingState() {
  return <div className="loading-state"><div className="spinner" /><span>Loading secure household data…</span></div>;
}
