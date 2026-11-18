import { Navigate, createFileRoute, useNavigate } from '@tanstack/react-router'
import { StoryTask } from '../components/tasks/StoryTask'
import { storyById } from '../content'

export const Route = createFileRoute('/stories/$id')({ component: StoryPage })

function StoryPage() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const story = storyById(id)
  if (!story) return <Navigate to="/stories" />
  const back = () => void navigate({ to: '/stories' })
  return <StoryTask story={story} frame={{ block: 'story', title: 'Story', label: '', progress: 0, onClose: back }} onDone={back} />
}
