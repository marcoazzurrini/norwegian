// The frame of every page of a course. The address names the course; this route opens it
// before any of its pages is drawn, and shows the sign-in screen until the learner is signed in.
import { courseMeta } from "@norsk/courses";
import { Bare } from "@norsk/ui";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { SignInScreen } from "../../components/sign-in-screen";
import {
  addressInCourse,
  enterCourse,
  isCourse,
  prepareCourse,
  rememberCourse,
} from "../../course";
import { learner, useReady, useSettings, useSyncStatus } from "../../learner";

interface GateProps {
  /** The name of the app while this course is open. */
  name: string;
}

/** Loads the learner's data of the course from this device, then shows its pages. */
const Gate = ({ name }: GateProps) => {
  const ready = useReady();
  const { textScale } = useSettings();
  const sync = useSyncStatus();

  useEffect(() => {
    learner().start().catch(reportError);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--text-scale",
      String(textScale)
    );
  }, [textScale]);

  // `bun run dev` serves the app without the sign-in server, so it skips the sign-in screen.
  const open = sync.linked || import.meta.env.DEV;

  if (!ready || (!open && !sync.checked)) {
    return <Bare name={name} />;
  }

  if (!open) {
    return <SignInScreen />;
  }

  return <Outlet />;
};

const CoursePage = () => {
  const { course } = Route.useParams();

  // The course is made the open one before its pages read anything from it.
  const { meta } = enterCourse(course).course;

  useEffect(() => {
    rememberCourse(meta.id);
  }, [meta]);

  // A change of course starts everything under it afresh: nothing of the other course stays on screen.
  return <Gate key={meta.id} name={meta.wordmark} />;
};

export const Route = createFileRoute("/$course")({
  // An address from before there were courses starts with a page, such as "/map": it goes to that page of a course.
  beforeLoad: ({ location, params }) => {
    if (!isCourse(params.course)) {
      // oxlint-disable-next-line typescript/only-throw-error -- the router sends the browser elsewhere when what `redirect` returns is thrown
      throw redirect({ href: addressInCourse(location), replace: true });
    }
  },
  component: CoursePage,
  head: ({ params }) => {
    const meta = courseMeta(params.course);

    if (meta === undefined) {
      return {};
    }

    const title = `${meta.wordmark.charAt(0).toUpperCase()}${meta.wordmark.slice(1)}`;

    return {
      meta: [
        { title },
        {
          content: `Learn ${meta.name} with spaced, compressed recall.`,
          name: "description",
        },
        { content: title, name: "apple-mobile-web-app-title" },
      ],
    };
  },
  // The course is only prepared here: this also runs for a link the pointer rests on.
  loader: async ({ params }) => {
    await prepareCourse(params.course);
  },
  // A course and the learner's data are only in the browser.
  ssr: false,
});
