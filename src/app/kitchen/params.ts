import { notFound } from "next/navigation";
import { isDateStr } from "@/domain/time";

/** The [date] route segment as a business date, or 404. */
export async function cookDateParam(params: Promise<{ date: string }>): Promise<string> {
  const { date } = await params;
  if (!isDateStr(date)) notFound();
  return date;
}
