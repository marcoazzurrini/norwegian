import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";

import { StoryTask } from "../../components/tasks/story-task";
import { useCourse } from "../../course";

const StoryPage = () => {
  const course = useCourse();
  const { course: courseId, id } = Route.useParams();
  const navigate = useNavigate();
  const story = course.storyById(id);

  if (story === undefined) {
    return <Navigate to="/$course/stories" params={{ course: courseId }} />;
  }

  const back = () => {
    navigate({ params: { course: courseId }, to: "/$course/stories" }).catch(
      reportError
    );
  };

  return (
    <StoryTask
      story={story}
      frame={{
        block: "story",
        label: "",
        onClose: back,
        progress: 0,
        title: "Story",
      }}
      onDone={back}
    />
  );
};

export const Route = createFileRoute("/$course/stories/$id")({
  component: StoryPage,
});
