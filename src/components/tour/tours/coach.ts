import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Coach tour (docs/STAFF_TOUR.md). The feed, posts and challenges live in the client app (/app/community, a coach's
// home); the coach tools (challenge, announcement, pin list) are on the staff Community page, which a coach-only
// person can open too. Moderation (hide, mute) is for owners and operations, so coaches learn to Report.
export const coachTour: TourDef = {
  id: "coach",
  steps: [
    welcomeStep("coach", "Coaches keep the community going: posts, answers and challenges. This tour shows the feed and your coach tools."),
    weekStep,

    // Feed
    {
      id: "feed",
      path: "/app/community",
      target: "community-post",
      title: "The community feed",
      body: "Members share meals, progress and questions here. Pinned posts sit on top, then the latest. Read it every day and react or comment.",
    },
    {
      id: "new-post",
      target: "community-new-post",
      title: "Post as coach",
      body: "New post opens the form. Your posts carry a Coach badge, and only coaches can pick Announcement for news every member should see.",
    },

    // Coach tools on the staff side
    {
      id: "coach-challenge",
      path: "/staff/community?tab=coach",
      target: "community-challenge",
      title: "Create a challenge",
      body: "Give it a title, one daily check-in question and the dates. Members get a notification and check in once a day.",
    },
    {
      id: "coach-announce",
      target: "community-announce",
      title: "Post an announcement",
      body: "A quick text announcement for every member; they get a notification. For photos, use New post in the feed.",
    },
    {
      id: "coach-pin",
      target: "community-pin",
      title: "Pin or unpin posts",
      body: "Recent posts with a Pin button. Pin a good answer or this week's challenge so it stays at the top of the feed. Next, we open one post.",
    },

    // A post: pin, report, mark answer
    {
      id: "post-actions",
      path: { hrefOf: "community-pin-post" },
      target: "post-actions",
      title: "Pin and Report on a post",
      body: "Every post has Pin here, and Report on posts by others. On a question, Mark as answer sits under the best comment.",
    },
    {
      id: "reports",
      title: "Reports and moderation",
      body: "If a post or comment breaks the rules, tap Report and say why. Owners and operations get the report, then hide the post or mute the member. Coaches do not hide or mute.",
    },

    {
      // only people who can moderate (owner or operations who are also coaches) have this tab; skipped for a coach-only person
      id: "moderation",
      path: "/staff/community?tab=reports",
      target: "community-reports",
      title: "Reports to handle",
      body: "You also run the business, so reports land here. Read each one, then Hide it with a reason or Dismiss the report.",
    },

    // Progress the coach can see
    {
      id: "progress",
      path: "/app/community",
      target: "community-filters",
      title: "Client progress",
      body: "Tap Progress to see members' progress posts with their weight change. You see only what members share here, not their plans, payments or nutrition notes.",
    },
    {
      id: "challenges",
      path: "/app/community/challenges",
      target: "challenges-list",
      title: "Challenges",
      body: "Active, upcoming and ended challenges with how many members joined. Next, we open the first one.",
    },
    {
      id: "leaderboard",
      path: { hrefOf: "challenge-open" },
      target: "challenge-leaderboard",
      title: "Leaderboard",
      body: "Who checked in on the most days. Cheer on the leaders and nudge the ones who stopped.",
    },

    yourWeekStep([
      { label: "Every day: read and answer in the feed", href: "/app/community" },
      { label: "Every day: questions waiting for a coach", href: "/app/community?type=question" },
      { label: "Each week: start a challenge or post an announcement", href: "/staff/community?tab=coach" },
      { label: "Check the challenge leaderboard", href: "/app/community/challenges" },
    ]),
  ],
};
