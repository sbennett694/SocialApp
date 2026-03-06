import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  Club,
  createProject,
  createProjectHighlight,
  createProjectMilestone,
  createProjectMilestoneTask,
  getCategories,
  getClubMembers,
  getProjectClubLinks,
  getProjects,
  getProjectHighlights,
  getProjectMilestones,
  Project,
  ProjectClubLink,
  ProjectHighlight,
  ProjectMilestone,
  ProjectMilestoneTask,
  requestProjectClubLink,
  reviewProjectClubLink,
  searchClubs,
  updateProjectMilestone,
  updateProjectMilestoneTask
} from "../api/client";
import { AuthUser } from "../auth/session";

type ProjectsScreenProps = { user: AuthUser };
type MilestoneVisualState = "COMPLETED" | "IN_PROGRESS" | "FUTURE";

export function ProjectsScreen({ user }: ProjectsScreenProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createAs, setCreateAs] = useState<"USER" | "CLUB">("USER");
  const [selectedClubId, setSelectedClubId] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [categoryNameInput, setCategoryNameInput] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTab, setProjectTab] = useState<"HIGHLIGHTS" | "MILESTONES">("HIGHLIGHTS");
  const [projectHighlights, setProjectHighlights] = useState<ProjectHighlight[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<ProjectMilestone[]>([]);
  const [projectClubLinks, setProjectClubLinks] = useState<ProjectClubLink[]>([]);
  const [projectDetailLoading, setProjectDetailLoading] = useState(false);
  const [newHighlightText, setNewHighlightText] = useState("");
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [taskDraftsByMilestone, setTaskDraftsByMilestone] = useState<Record<string, string>>({});
  const [requestClubModalOpen, setRequestClubModalOpen] = useState(false);
  const [clubSearchQuery, setClubSearchQuery] = useState("");
  const [clubRolesById, setClubRolesById] = useState<Record<string, "OWNER" | "MODERATOR" | "MEMBER" | null>>({});
  const [clubRolesLoading, setClubRolesLoading] = useState(false);

  async function loadData() {
    setLoading(true);
    setMessage(null);
    try {
      const [projectList, categoryData, clubs] = await Promise.all([
        getProjects(user.userId),
        getCategories(),
        searchClubs({ viewerId: user.userId })
      ]);
      setProjects(projectList);
      setCategories(categoryData.categories);
      setAllClubs(clubs);
      setMyClubs(clubs.filter((club) => club.ownerId === user.userId));
      if (!selectedCategoryId && categoryData.categories.length > 0) {
        setSelectedCategoryId(categoryData.categories[0].id);
        setCategoryNameInput(categoryData.categories[0].name);
      }
      if (!selectedClubId && clubs.length > 0) {
        setSelectedClubId(clubs[0].id);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user.userId]);

  async function refreshProjectDetails(project: Project) {
    setProjectDetailLoading(true);
    try {
      const [highlights, milestones, links] = await Promise.all([
        getProjectHighlights(project.id),
        getProjectMilestones(project.id),
        getProjectClubLinks(project.id, user.userId)
      ]);
      setProjectHighlights(highlights);
      setProjectMilestones(
        milestones.map((item, index) => ({
          ...item,
          order: typeof item.order === "number" ? item.order : index + 1,
          tasks: Array.isArray(item.tasks) ? item.tasks : []
        }))
      );
      setProjectClubLinks(links);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setProjectDetailLoading(false);
    }
  }

  async function openProject(project: Project) {
    setSelectedProject(project);
    setProjectTab("HIGHLIGHTS");
    setRequestClubModalOpen(false);
    setClubSearchQuery("");
    await refreshProjectDetails(project);
  }

  async function handleRequestProjectClubLink(clubId: string) {
    if (!selectedProject || !clubId) return;
    try {
      const response = await requestProjectClubLink({
        projectId: selectedProject.id,
        clubId,
        actorId: user.userId
      });
      setMessage(
        response.status === "APPROVED"
          ? "Project added to club."
          : "Project sent for club approval."
      );
      setRequestClubModalOpen(false);
      setClubSearchQuery("");
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleOpenRequestClubModal(linkableClubs: Club[]) {
    setRequestClubModalOpen(true);

    if (linkableClubs.length === 0) return;

    setClubRolesLoading(true);
    try {
      const rolePairs = await Promise.all(
        linkableClubs.map(async (club) => {
          const members = await getClubMembers(club.id);
          const me = members.find((member) => member.userId === user.userId);
          return [club.id, me?.role ?? null] as const;
        })
      );

      setClubRolesById((prev) => {
        const next = { ...prev };
        rolePairs.forEach(([clubId, role]) => {
          next[clubId] = role;
        });
        return next;
      });
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setClubRolesLoading(false);
    }
  }

  async function handleReviewProjectClubLink(clubId: string, status: "APPROVED" | "REJECTED") {
    if (!selectedProject) return;
    try {
      await reviewProjectClubLink({
        projectId: selectedProject.id,
        clubId,
        actorId: user.userId,
        status
      });
      setMessage(status === "APPROVED" ? "Project approved for club." : "Project request rejected.");
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  const categoryById = useMemo(() => new Map(categories.map((category) => [category.id, category.name])), [categories]);

  const orderedMilestones = useMemo(
    () => [...projectMilestones].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)),
    [projectMilestones]
  );

  const firstOpenMilestoneIndex = useMemo(
    () => orderedMilestones.findIndex((item) => item.status !== "DONE"),
    [orderedMilestones]
  );

  const activeMilestone = firstOpenMilestoneIndex >= 0 ? orderedMilestones[firstOpenMilestoneIndex] : null;

  function getMilestoneVisualState(milestone: ProjectMilestone, index: number): MilestoneVisualState {
    if (milestone.status === "DONE") return "COMPLETED";
    if (firstOpenMilestoneIndex === -1) return "FUTURE";
    if (index === firstOpenMilestoneIndex) return "IN_PROGRESS";
    return "FUTURE";
  }

  async function handleCreateProject() {
    if (!title.trim() || !selectedCategoryId) return;
    try {
      await createProject({
        ownerId: createAs === "CLUB" && selectedClubId ? selectedClubId : user.userId,
        createdBy: user.userId,
        clubId: createAs === "CLUB" ? selectedClubId || undefined : undefined,
        categoryId: selectedCategoryId,
        title: title.trim(),
        description: description.trim() || undefined
      });
      setCreateModalOpen(false);
      setTitle("");
      setDescription("");
      setMessage("Project created.");
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function canManageSelectedProject(): Promise<boolean> {
    if (!selectedProject) return false;
    if (!selectedProject.clubId) {
      return selectedProject.ownerId === user.userId || selectedProject.createdBy === user.userId;
    }
    const members = await getClubMembers(selectedProject.clubId);
    const me = members.find((member) => member.userId === user.userId);
    return me?.role === "OWNER" || me?.role === "MODERATOR";
  }

  async function handleCreateHighlight() {
    if (!selectedProject || !newHighlightText.trim()) return;
    try {
      if (!(await canManageSelectedProject())) throw new Error("Only owner/admin can add highlights.");
      await createProjectHighlight({ projectId: selectedProject.id, authorId: user.userId, text: newHighlightText.trim() });
      setNewHighlightText("");
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleCreateMilestone() {
    if (!selectedProject || !newMilestoneTitle.trim()) return;
    try {
      if (!(await canManageSelectedProject())) throw new Error("Only owner/admin can manage milestones.");
      await createProjectMilestone({ projectId: selectedProject.id, actorId: user.userId, title: newMilestoneTitle.trim() });
      setNewMilestoneTitle("");
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function toggleMilestone(item: ProjectMilestone, index: number) {
    if (!selectedProject) return;
    try {
      const visualState = getMilestoneVisualState(item, index);
      if (item.status !== "DONE" && visualState === "FUTURE") {
        setMessage("Complete the active milestone first.");
        return;
      }

      await updateProjectMilestone({
        projectId: selectedProject.id,
        milestoneId: item.id,
        actorId: user.userId,
        status: item.status === "DONE" ? "OPEN" : "DONE"
      });
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleCreateMilestoneTask(milestoneId: string) {
    if (!selectedProject) return;
    const text = (taskDraftsByMilestone[milestoneId] ?? "").trim();
    if (!text) return;
    try {
      if (!(await canManageSelectedProject())) throw new Error("Only owner/admin can manage milestone tasks.");
      await createProjectMilestoneTask({ projectId: selectedProject.id, milestoneId, actorId: user.userId, text });
      setTaskDraftsByMilestone((prev) => ({ ...prev, [milestoneId]: "" }));
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function toggleMilestoneTask(milestoneId: string, task: ProjectMilestoneTask) {
    if (!selectedProject) return;
    try {
      if (!(await canManageSelectedProject())) throw new Error("Only owner/admin can manage milestone tasks.");
      await updateProjectMilestoneTask({
        projectId: selectedProject.id,
        milestoneId,
        taskId: task.id,
        actorId: user.userId,
        isDone: !task.isDone
      });
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 24 }} />;

  if (selectedProject) {
    const approvedLinks = projectClubLinks.filter((link) => link.status === "APPROVED");
    const pendingLinks = projectClubLinks.filter((link) => link.status === "PENDING");
    const linkableClubs = allClubs.filter(
      (club) => !projectClubLinks.some((link) => link.clubId === club.id && link.status !== "REJECTED")
    );

    const searchableClubOptions = linkableClubs
      .filter((club) => club.name.toLowerCase().includes(clubSearchQuery.trim().toLowerCase()))
      .map((club) => {
        const role = clubRolesById[club.id];
        const isOwnedOrAdmin =
          club.ownerId === user.userId || role === "OWNER" || role === "MODERATOR";
        const isMember = isOwnedOrAdmin || role === "MEMBER";
        return {
          ...club,
          relevanceRank: isOwnedOrAdmin ? 0 : isMember ? 1 : 2,
          relevanceLabel: isOwnedOrAdmin
            ? "Your admin/owned club"
            : isMember
              ? "Your club"
              : "Other relevant club"
        };
      })
      .sort((a, b) => a.relevanceRank - b.relevanceRank || a.name.localeCompare(b.name));

    const requestClubModal = (
      <Modal visible={requestClubModalOpen} transparent animationType="fade" onRequestClose={() => setRequestClubModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Request to Add Club</Text>
            <Text style={styles.hint}>Select a club to request association with this project.</Text>

            <TextInput
              value={clubSearchQuery}
              onChangeText={setClubSearchQuery}
              placeholder="Search clubs by name"
              style={styles.input}
            />

            {clubRolesLoading ? <ActivityIndicator style={{ marginBottom: 8 }} /> : null}

            <FlatList
              data={searchableClubOptions}
              keyExtractor={(item) => item.id}
              style={styles.modalList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.hint}>No matching clubs found.</Text>}
              renderItem={({ item }) => (
                <Pressable style={styles.modalListItem} onPress={() => handleRequestProjectClubLink(item.id)}>
                  <Text style={styles.modalListItemTitle}>{item.name}</Text>
                  <Text style={styles.hint}>{item.relevanceLabel}</Text>
                </Pressable>
              )}
            />

            <View style={styles.rowWrap}>
              <Pressable onPress={() => setRequestClubModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );

    const detailHeader = (
      <View>
        <Pressable onPress={() => setSelectedProject(null)} style={styles.button}><Text style={styles.buttonText}>← Back to Projects</Text></Pressable>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{selectedProject.title}</Text>
          <Text style={styles.hint}>{selectedProject.description || "No description"}</Text>

          <View style={styles.clubPanel}>
            <Text style={styles.activeMilestoneTitle}>Clubs</Text>
            {approvedLinks.length === 0 ? <Text style={styles.hint}>Not attached to any clubs yet.</Text> : null}
            {approvedLinks.map((link) => (
              <Text key={`approved-${link.clubId}`} style={styles.hint}>• {link.club?.name ?? link.clubId} (approved)</Text>
            ))}

            <Pressable onPress={() => handleOpenRequestClubModal(linkableClubs)} style={styles.buttonInline}>
              <Text style={styles.buttonText}>Request to Add Club</Text>
            </Pressable>
            {linkableClubs.length === 0 ? <Text style={styles.hint}>No additional clubs available for this project.</Text> : null}

            {pendingLinks.length > 0 ? <Text style={styles.label}>Pending Requests</Text> : null}
            {pendingLinks.map((link) => (
              <View key={`pending-${link.clubId}`} style={styles.pendingCard}>
                <Text style={styles.hint}>• {link.club?.name ?? link.clubId} (pending)</Text>
                {link.canApprove ? (
                  <View style={styles.rowWrap}>
                    <Pressable onPress={() => handleReviewProjectClubLink(link.clubId, "APPROVED")} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Approve</Text>
                    </Pressable>
                    <Pressable onPress={() => handleReviewProjectClubLink(link.clubId, "REJECTED")} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Reject</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>

          <View style={styles.activeMilestoneBox}>
            <Text style={styles.activeMilestoneTitle}>Active Milestone</Text>
            {activeMilestone ? (
              <>
                <Text style={styles.title}>{activeMilestone.order}. {activeMilestone.title}</Text>
                {(activeMilestone.tasks ?? []).length === 0 ? <Text style={styles.hint}>No tasks yet.</Text> : null}
                {(activeMilestone.tasks ?? []).map((task) => (
                  <Text key={task.id} style={styles.hint}>{task.isDone ? "☑" : "☐"} {task.text}</Text>
                ))}
              </>
            ) : (
              <Text style={styles.hint}>All milestones completed 🎉</Text>
            )}
          </View>
        </View>
        <View style={styles.rowWrap}>
          <Pressable onPress={() => setProjectTab("HIGHLIGHTS")} style={[styles.pill, projectTab === "HIGHLIGHTS" && styles.pillActive]}><Text style={[styles.pillText, projectTab === "HIGHLIGHTS" && styles.pillTextActive]}>Highlights</Text></Pressable>
          <Pressable onPress={() => setProjectTab("MILESTONES")} style={[styles.pill, projectTab === "MILESTONES" && styles.pillActive]}><Text style={[styles.pillText, projectTab === "MILESTONES" && styles.pillTextActive]}>Milestones</Text></Pressable>
        </View>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {projectDetailLoading ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
      </View>
    );

    if (projectTab === "HIGHLIGHTS") {
      return (
        <>
          <FlatList
            data={projectHighlights}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View>
                {detailHeader}
                <View style={styles.card}>
                  <TextInput value={newHighlightText} onChangeText={setNewHighlightText} placeholder="Add project highlight" style={styles.input} />
                  <Pressable onPress={handleCreateHighlight} style={styles.button}><Text style={styles.buttonText}>Post Highlight</Text></Pressable>
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.card}><Text style={styles.title}>@{item.authorId}</Text><Text>{item.text}</Text></View>
            )}
          />
          {requestClubModal}
        </>
      );
    }

    return (
      <>
        <FlatList
          data={orderedMilestones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              {detailHeader}
              <View style={styles.card}>
                <TextInput value={newMilestoneTitle} onChangeText={setNewMilestoneTitle} placeholder="Add milestone" style={styles.input} />
                <Pressable onPress={handleCreateMilestone} style={styles.button}><Text style={styles.buttonText}>Create Milestone</Text></Pressable>
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const visualState = getMilestoneVisualState(item, index);
            const cardStyle = visualState === "COMPLETED" ? styles.milestoneDone : visualState === "IN_PROGRESS" ? styles.milestoneActive : styles.milestoneFuture;
            const canToggleToDone = item.status === "DONE" || visualState !== "FUTURE";

            return (
              <View style={[styles.card, cardStyle]}>
                <Text style={styles.title}>{item.order}. {item.title}</Text>
                <Text style={styles.hint}>State: {visualState === "COMPLETED" ? "Completed" : visualState === "IN_PROGRESS" ? "In Progress" : "Future"}</Text>

                <Pressable
                  onPress={() => toggleMilestone(item, index)}
                  disabled={!canToggleToDone}
                  style={[styles.pill, !canToggleToDone && styles.pillDisabled]}
                >
                  <Text style={styles.pillText}>{item.status}</Text>
                </Pressable>

                <Text style={styles.label}>Tasks</Text>
                <TextInput
                  value={taskDraftsByMilestone[item.id] ?? ""}
                  onChangeText={(value) => setTaskDraftsByMilestone((prev) => ({ ...prev, [item.id]: value }))}
                  placeholder="Add task"
                  style={styles.taskInput}
                />
                <Pressable onPress={() => handleCreateMilestoneTask(item.id)} style={styles.buttonInline}><Text style={styles.buttonText}>Add Task</Text></Pressable>

                <View style={styles.taskListBlock}>
                  {(item.tasks ?? []).length === 0 ? <Text style={styles.hint}>No tasks yet.</Text> : null}
                  {(item.tasks ?? []).map((task) => (
                    <Pressable key={task.id} onPress={() => toggleMilestoneTask(item.id, task)} style={styles.taskRow}>
                      <View style={[styles.taskCheckbox, task.isDone && styles.taskCheckboxDone]}>
                        {task.isDone ? <Text style={styles.taskCheckboxMark}>✓</Text> : null}
                      </View>
                      <Text style={styles.taskText}>{task.text}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          }}
        />
        {requestClubModal}
      </>
    );
  }

  return (
    <>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={loadData}
        ListHeaderComponent={
          <View>
            <Text style={styles.sectionTitle}>Projects</Text>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            <Pressable onPress={() => setCreateModalOpen(true)} style={styles.button}><Text style={styles.buttonText}>Create Project</Text></Pressable>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openProject(item)} style={styles.card}>
            <Text style={styles.title}>{item.title}</Text>
            <Text>{item.description || "No description"}</Text>
            <Text style={styles.hint}>Category: {categoryById.get(item.categoryId) ?? item.categoryId}</Text>
          </Pressable>
        )}
      />

      <Modal visible={createModalOpen} transparent animationType="fade" onRequestClose={() => setCreateModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Create Project</Text>
            <View style={styles.rowWrap}>
              <Pressable onPress={() => setCreateAs("USER")} style={[styles.pill, createAs === "USER" && styles.pillActive]}><Text style={[styles.pillText, createAs === "USER" && styles.pillTextActive]}>As Me</Text></Pressable>
              <Pressable onPress={() => setCreateAs("CLUB")} style={[styles.pill, createAs === "CLUB" && styles.pillActive]}><Text style={[styles.pillText, createAs === "CLUB" && styles.pillTextActive]}>As Club</Text></Pressable>
            </View>
            {createAs === "CLUB" ? (
              <View style={styles.rowWrap}>
                {myClubs.map((club) => (
                  <Pressable key={club.id} onPress={() => setSelectedClubId(club.id)} style={[styles.pill, selectedClubId === club.id && styles.pillActive]}>
                    <Text style={[styles.pillText, selectedClubId === club.id && styles.pillTextActive]}>{club.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={styles.label}>Club Category</Text>
            <TextInput value={categoryNameInput} onChangeText={setCategoryNameInput} placeholder="Club category" style={styles.input} />
            <View style={styles.rowWrap}>
              {categories.slice(0, 24).map((category) => (
                <Pressable
                  key={category.id}
                  onPress={() => {
                    setSelectedCategoryId(category.id);
                    setCategoryNameInput(category.name);
                  }}
                  style={[styles.pill, selectedCategoryId === category.id && styles.pillActive]}
                >
                  <Text style={[styles.pillText, selectedCategoryId === category.id && styles.pillTextActive]}>{category.name}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput value={title} onChangeText={setTitle} placeholder="Project title" style={styles.input} />
            <TextInput value={description} onChangeText={setDescription} placeholder="Project description" style={styles.input} />
            <View style={styles.rowWrap}>
              <Pressable onPress={handleCreateProject} style={styles.buttonInline}><Text style={styles.buttonText}>Create</Text></Pressable>
              <Pressable onPress={() => setCreateModalOpen(false)} style={styles.buttonInline}><Text style={styles.buttonText}>Cancel</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  title: { fontWeight: "600", marginBottom: 6 },
  hint: { color: "#666", marginTop: 4 },
  message: { color: "#0b57d0", marginBottom: 8 },
  label: { fontWeight: "600", marginBottom: 6, marginTop: 6 },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  pill: { borderWidth: 1, borderColor: "#aaa", borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10, alignSelf: "flex-start" },
  pillActive: { backgroundColor: "#111", borderColor: "#111" },
  pillDisabled: { opacity: 0.45 },
  pillText: { fontSize: 12, fontWeight: "600", color: "#333" },
  pillTextActive: { color: "#fff" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginBottom: 8 },
  button: { borderWidth: 1, borderColor: "#333", borderRadius: 8, paddingVertical: 9, alignItems: "center", marginBottom: 8 },
  buttonInline: { borderWidth: 1, borderColor: "#333", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, alignItems: "center", alignSelf: "flex-start" },
  buttonText: { fontWeight: "600" },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 10, marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 16 },
  modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, maxHeight: "85%" },
  milestoneDone: { borderColor: "#1b8f3c", backgroundColor: "#f0fff4" },
  milestoneActive: { borderColor: "#0b57d0", backgroundColor: "#f3f8ff" },
  milestoneFuture: { borderColor: "#b0b0b0", backgroundColor: "#f7f7f7" },
  activeMilestoneBox: { marginTop: 6, borderWidth: 1, borderColor: "#d9d9d9", borderRadius: 8, padding: 8 },
  activeMilestoneTitle: { fontWeight: "700", marginBottom: 4 },
  taskRow: { paddingVertical: 3 }
  ,
  clubPanel: { marginTop: 6, borderWidth: 1, borderColor: "#d9d9d9", borderRadius: 8, padding: 8, marginBottom: 8 },
  pendingCard: { borderWidth: 1, borderColor: "#e5e5e5", borderRadius: 8, padding: 8, marginTop: 6 },
  taskInput: { borderWidth: 1, borderColor: "#bbb", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, marginBottom: 8 },
  taskListBlock: { marginTop: 8 },
  taskCheckbox: { width: 22, height: 22, borderWidth: 1.5, borderColor: "#666", borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 10 },
  taskCheckboxDone: { borderColor: "#0b57d0", backgroundColor: "#e8f0ff" },
  taskCheckboxMark: { fontSize: 14, fontWeight: "700", color: "#0b57d0" },
  taskText: { fontSize: 16, color: "#222", flexShrink: 1 },
  modalList: { maxHeight: 280, marginBottom: 8 },
  modalListItem: { borderWidth: 1, borderColor: "#e1e1e1", borderRadius: 10, padding: 10, marginBottom: 8 },
  modalListItemTitle: { fontWeight: "600", marginBottom: 4 }
});
