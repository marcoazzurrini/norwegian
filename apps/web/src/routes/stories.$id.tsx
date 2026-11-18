import { storyById } from "@norsk/content";
import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";

import { StoryTask } from "../components/tasks/story-task";

const StoryPage = () => {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const story = storyById(id);

  if (story === undefined) {
    return <Navigate to="/stories" />;
  }

  const back = () => {
    navigate({ to: "/stories" }).catch(reportError);
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

export const Route = createFileRoute("/stories/$id")({ component: StoryPage });
