// The bare address of the site. It belongs to no course, so it goes on to the course that was open last.
import { createFileRoute, redirect } from "@tanstack/react-router";

import { addressInCourse } from "../course";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    // oxlint-disable-next-line typescript/only-throw-error -- the router sends the browser elsewhere when what `redirect` returns is thrown
    throw redirect({ href: addressInCourse(location), replace: true });
  },
  // Which course was open last is only known in the browser.
  ssr: false,
});
