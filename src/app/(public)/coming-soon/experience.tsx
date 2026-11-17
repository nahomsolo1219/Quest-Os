"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { PhoneInput } from "@/components/public/phone-input";
import { joinWaitlistAction } from "./actions";
import { Logo } from "@/components/shell/logo";
import { mealFor, type Fasting, type Goal, type Meal } from "./boxes";
import styles from "./experience.module.css";

const GOALS: { value: Goal; label: string }[] = [
  { value: "lose", label: "Lose fat" },
  { value: "healthy", label: "Eat better" },
  { value: "build", label: "Build muscle" },
];
const FASTING: { value: Fasting; label: string }[] = [
  { value: "none", label: "I don’t fast" },
  { value: "wed_fri", label: "Wednesdays and Fridays" },
  { value: "seasons", label: "Wed, Fri and fasting seasons" },
];

const SAMPLE_NAMES = ["Selam", "Dawit", "Hana", "Yonas", "Meron", "Abel", "Kidist", "Natnael", "Liya", "Bereket"];

/** Handwritten value that "writes itself in" whenever the text changes. */
function Hand({ text, className }: { text: string; className?: string }) {
  return <span key={text} className={`${styles.hand} ${styles.write} ${className ?? ""}`}>{text}</span>;
}

/** Until the visitor types, the client-name line cycles through sample names. */
function useSampleName(active: boolean) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((n) => (n + 1) % SAMPLE_NAMES.length), 2400);
    return () => clearInterval(t);
  }, [active]);
  return SAMPLE_NAMES[i];
}

function MealLabel({ meal, name, joined, position }: { meal: Meal; name: string; joined: boolean; position: number | null }) {
  const typed = name.trim();
  const sample = useSampleName(!typed);
  return (
    <figure className={styles.sleeve} aria-label={`Example meal label: ${meal.name}, ${meal.kcal} kcal, ${meal.protein} g protein, ${meal.carbs} g carbs, ${meal.fat} g fat.`}>
      <div className={styles.label}>
        <div className={styles.labelTop}>
          <Logo variant="horizontal" height={26} />
          <span className={styles.labelTag}>Meal</span>
        </div>
        <p className={styles.small}>Food item name</p>
        <p className={styles.dish}><Hand text={meal.name} /></p>
        <div className={styles.macros}>
          <div className={`${styles.box} ${styles.kcalBox}`}>
            <span className={styles.small}>Calories</span>
            <span><Hand text={String(meal.kcal)} className={styles.kcal} /> kcal</span>
          </div>
          {([["Protein", meal.protein], ["Carbs", meal.carbs], ["Fat", meal.fat]] as const).map(([k, v]) => (
            <div key={k} className={styles.box}>
              <span><Hand text={String(v)} className={styles.gram} /> g</span>
              <span className={styles.small}>{k}</span>
            </div>
          ))}
        </div>
        <div className={styles.lines}>
          <span className={styles.checks}>
            <span className={styles.cb} /> Breakfast <span className={`${styles.cb} ${styles.cbOn}`} aria-hidden>✓</span> Lunch <span className={styles.cb} /> Dinner
          </span>
          <span className={styles.line}><span className={styles.small}>Client name</span><Hand text={typed || sample} className={typed ? undefined : styles.sample} /></span>
          <span className={styles.line}><span className={styles.small}>Size</span><Hand text={meal.size} /></span>
          <span className={styles.line}><span className={styles.small}>Made</span><span className={styles.hand}>30 Nov</span></span>
          <span className={styles.line}><span className={styles.small}>Eat by</span><span className={styles.hand}>2 Dec</span></span>
        </div>
        <p className={styles.keep}>Keep 0–5°C | Reheat hot</p>
        <span className={`${styles.stamp} ${joined ? styles.stampOn : ""}`} aria-hidden={!joined}>
          <span className={styles.stampSmall}>Waitlist</span>
          <span className={styles.stampNo}>{position ? `No. ${position}` : "Saved"}</span>
        </span>
      </div>
      <figcaption className={styles.note}>Example meal. Our nutritionist sets your real portions.</figcaption>
    </figure>
  );
}

function Pills<T extends string>({ name, legend, value, onChange, options }: {
  name: string; legend: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  return (
    <fieldset className={styles.pills}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.pillRow}>
        {options.map((o) => (
          <label key={o.value} className={`${styles.pill} ${value === o.value ? styles.pillOn : ""}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Experience({ areas, source, daysLeft }: { areas: { id: string; name: string }[]; source: string | null; daysLeft: number }) {
  const [goal, setGoal] = useState<Goal>("healthy");
  const [fasting, setFasting] = useState<Fasting>("none");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [areaId, setAreaId] = useState("");
  const [telegram, setTelegram] = useState(true);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ position: number | null } | null>(null);
  const [pending, start] = useTransition();
  const meal = mealFor(goal, fasting);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await joinWaitlistAction({ name, phone, areaId: areaId || null, goal, fasting, telegram, source, website });
      if (r.ok) setJoined({ position: r.data.position });
      else setError(r.error);
    });
  }

  return (
    <div className={styles.stage}>
      <div className={styles.copy}>
        <h1 className={styles.headline}>Fresh meals, portioned for your&nbsp;goal.</h1>
        <p className={styles.amharic} lang="am">ምግብዎ፣ በግብዎ ልክ።</p>
        <p className={styles.lede}>
          Ready-to-eat meals delivered in Addis Ababa, cooked fresh and weighed to your calories and protein.
          Planned by coaches Dagi and Kidus, with a fasting menu.
        </p>
        <p className={styles.opens}>
          Opening Monday 30 November{daysLeft > 0 ? ` (in ${daysLeft} ${daysLeft === 1 ? "day" : "days"})` : ""}. Join the waitlist to get first access.
        </p>
      </div>

      <div className={styles.trayCol}>
        <h2 className={styles.trayTitle}>{joined ? "You’re on the waitlist" : "Every meal comes with a label like this"}</h2>
        {joined ? null : <p className={styles.trayHint}>Choose your goal and fasting days to see an example.</p>}
        <MealLabel meal={meal} name={name} joined={!!joined} position={joined?.position ?? null} />
        {joined ? null : (
          <div className={styles.controls}>
            <Pills name="goal" legend="What are you working toward?" value={goal} onChange={setGoal} options={GOALS} />
            <Pills name="fasting" legend="Do you fast?" value={fasting} onChange={setFasting} options={FASTING} />
          </div>
        )}
      </div>

      <div className={styles.formCol}>
        {joined ? (
          <div className={styles.done} role="status">
            <h2 className={styles.formTitle}>{joined.position ? `You’re number ${joined.position} on the waitlist.` : "You’re on the waitlist."}</h2>
            <p>We’ll message you before we open on Monday 30 November.</p>
            <p className={styles.doneLinks}>
              <Link href="/calculator">Find my exact calories</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className={styles.form}>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Your name</span>
                <input className={styles.input} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className={styles.field}>
                <span>Phone</span>
                <PhoneInput placeholder="9XX XXX XXX" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </label>
              {areas.length ? (
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Where should we deliver?</span>
                  <select className={styles.input} value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                    <option value="">I’ll choose later</option>
                    {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={telegram} onChange={(e) => setTelegram(e.target.checked)} />
              Also message me on Telegram
            </label>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <button type="submit" disabled={pending} className={styles.submit}>{pending ? "Joining…" : "Join the waitlist"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
