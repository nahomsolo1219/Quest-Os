"use client";

import { useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { PhoneInput } from "@/components/public/phone-input";
import { joinWaitlistAction } from "./actions";
import { boxFor, totals, type Box, type Fasting, type Goal, type Part } from "./boxes";
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

function Compartment({ part, grow, className }: { part: Part; grow: number; className?: string }) {
  return (
    <div className={`${styles.cell} ${styles[part.texture]} ${className ?? ""}`} style={{ flexGrow: grow, "--tone": part.tone } as CSSProperties}>
      <span className={styles.tag}>
        <span className={styles.tagName}>{part.name}</span>
        <span className={styles.tagGrams}>{part.grams} g</span>
      </span>
    </div>
  );
}

function Tray({ box, closed, position }: { box: Box; closed: boolean; position: number | null }) {
  const t = totals(box);
  return (
    <figure className={styles.trayWrap} aria-label={`Example box: ${box.protein.name} ${box.protein.grams} g, ${box.carb.name} ${box.carb.grams} g, ${box.veg.name} ${box.veg.grams} g. About ${t.kcal} kcal and ${t.protein} g protein.`}>
      <div className={styles.tray}>
        <div className={styles.row}>
          <Compartment part={box.protein} grow={box.protein.grams} />
          <Compartment part={box.carb} grow={box.carb.grams} />
        </div>
        <div className={styles.row} style={{ flexGrow: Math.max(70, box.veg.grams * 0.75) }}>
          <Compartment part={box.veg} grow={1} />
        </div>
        <div className={`${styles.lid} ${closed ? styles.lidClosed : ""}`} aria-hidden={!closed}>
          <span className={styles.lidMark}>Quest</span>
          <span className={styles.sticker}>
            <span className={styles.stickerSmall}>On the list</span>
            <span className={styles.stickerNo}>{position ? `No. ${position}` : "Saved"}</span>
          </span>
        </div>
      </div>
      <figcaption className={styles.readout}>
        <span><strong className="tabular">{t.kcal}</strong> kcal</span>
        <span><strong className="tabular">{t.protein} g</strong> protein</span>
        <span className={styles.readoutNote}>Example box. Your nutritionist sets the real numbers.</span>
      </figcaption>
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
  const box = boxFor(goal, fasting);

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
        <h1 className={styles.headline}>Your box, built to your&nbsp;numbers.</h1>
        <p className={styles.amharic} lang="am">ምግብዎ፣ በግብዎ ልክ።</p>
        <p className={styles.lede}>
          Quest cooks fresh, weighed meals in Addis Ababa, planned by coaches Dagi and Kidus and portioned to your calories and protein.
          We open on Monday 30 November{daysLeft > 0 ? `, ${daysLeft} ${daysLeft === 1 ? "day" : "days"} from now` : ""}.
        </p>
      </div>

      <div className={styles.trayCol}>
        <Tray box={box} closed={!!joined} position={joined?.position ?? null} />
      </div>

      <div className={styles.formCol}>
        {joined ? (
          <div className={styles.done} role="status">
            <h2 className={styles.formTitle}>{joined.position ? `You’re number ${joined.position} on the list.` : "You’re on the list."}</h2>
            <p>We’ll message you before we open on Monday 30 November. Your box will be built to your real numbers then.</p>
            <p className={styles.doneLinks}>
              <Link href="/calculator">Find my exact calories</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className={styles.form}>
            <h2 className={styles.formTitle}>Build yours, then save your spot</h2>
            <Pills name="goal" legend="What are you working toward?" value={goal} onChange={setGoal} options={GOALS} />
            <Pills name="fasting" legend="Do you fast?" value={fasting} onChange={setFasting} options={FASTING} />
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
              Send me launch news on Telegram
            </label>
            <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={website} onChange={(e) => setWebsite(e.target.value)} />
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <button type="submit" disabled={pending} className={styles.submit}>{pending ? "Saving your spot…" : "Save my spot"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
