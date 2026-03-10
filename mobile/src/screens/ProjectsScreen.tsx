import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, InteractionManager, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import {
  Club,
  createTaskTimeEntry,
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
  getTaskTimeEntries,
  Project,
  ProjectClubLink,
  ProjectHighlight,
  ProjectMilestone,
  ProjectMilestoneTask,
  ProjectVisibility,
  requestProjectClubLink,
  reviewProjectClubLink,
  searchClubs,
  TaskTimeEntry,
  updateProjectMilestone,
  updateProjectMilestoneTask
} from "../api/client";
import { AuthUser } from "../auth/session";
import { CategorySelectorField } from "../components/CategorySelectorField";
import { useTemporaryHighlight } from "../lib/useTemporaryHighlight";

type MilestoneVisualState = "COMPLETED" | "IN_PROGRESS" | "FUTURE";

type ProjectsScreenProps = {
  user: AuthUser;
  focusProjectId?: string;
  focusItemId?: string;
  focusItemType?: "MILESTONE" | "TASK";
  rootResetSignal?: number;
  onFocusProjectConsumed?: (projectId: string) => void;
  onFocusItemConsumed?: (itemId: string, itemType: "MILESTONE" | "TASK") => void;
  onBackToProjectsRoot?: () => void;
  onNavigateToClub?: (clubId: string) => void;
};

type ScheduleEditorTarget =
  | { kind: "MILESTONE"; milestoneId: string; label: string }
  | { kind: "TASK"; milestoneId: string; taskId: string; label: string };

type TaskTimeSummary = {
  entries: TaskTimeEntry[];
  taskTotalMinutes: number;
};

export function ProjectsScreen({
  user,
  focusProjectId,
  focusItemId,
  focusItemType,
  rootResetSignal = 0,
  onFocusProjectConsumed,
  onFocusItemConsumed,
  onBackToProjectsRoot,
  onNavigateToClub
}: ProjectsScreenProps) {
  const focusDebugEnabled = __DEV__;
  const logFocusDebug = (...args: unknown[]) => {
    if (!focusDebugEnabled) return;
    console.log("[ProjectsScreen focus]", ...args);
  };
  const {
    highlightedId: highlightedProjectId,
    triggerHighlight: triggerProjectHighlight,
    emphasisAnimatedStyle: projectEmphasisAnimatedStyle
  } = useTemporaryHighlight(1800);
  const {
    highlightedId: highlightedNestedItemId,
    triggerHighlight: triggerNestedItemHighlight,
    emphasisAnimatedStyle: nestedItemEmphasisAnimatedStyle,
    glowAnimatedStyle: nestedItemGlowAnimatedStyle
  } = useTemporaryHighlight(1800);
  const milestonesListRef = useRef<FlatList<ProjectMilestone> | null>(null);
  const milestoneOffsetByIdRef = useRef<Record<string, number>>({});
  const focusScrollRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScrollIndexRef = useRef<number | null>(null);
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [createVisibility, setCreateVisibility] = useState<ProjectVisibility>("PUBLIC");

  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectTab, setProjectTab] = useState<"HIGHLIGHTS" | "MILESTONES">("HIGHLIGHTS");
  const [projectHighlights, setProjectHighlights] = useState<ProjectHighlight[]>([]);
  const [projectMilestones, setProjectMilestones] = useState<ProjectMilestone[]>([]);
  const [projectClubLinks, setProjectClubLinks] = useState<ProjectClubLink[]>([]);
  const [projectDetailLoading, setProjectDetailLoading] = useState(false);
  const [newHighlightText, setNewHighlightText] = useState("");
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneTaskDraft, setNewMilestoneTaskDraft] = useState("");
  const [newMilestoneTaskDrafts, setNewMilestoneTaskDrafts] = useState<string[]>([]);
  const [taskDraftsByMilestone, setTaskDraftsByMilestone] = useState<Record<string, string>>({});
  const [requestClubModalOpen, setRequestClubModalOpen] = useState(false);
  const [clubSearchQuery, setClubSearchQuery] = useState("");
  const [clubRolesById, setClubRolesById] = useState<Record<string, "OWNER" | "MODERATOR" | "MEMBER" | null>>({});
  const [clubRolesLoading, setClubRolesLoading] = useState(false);
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [scheduleEditorTarget, setScheduleEditorTarget] = useState<ScheduleEditorTarget | null>(null);
  const [scheduleEditorStartAt, setScheduleEditorStartAt] = useState<Date | null>(null);
  const [scheduleEditorDueAt, setScheduleEditorDueAt] = useState<Date | null>(null);
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [schedulePickerField, setSchedulePickerField] = useState<"start" | "due">("start");
  const [schedulePickerMode, setSchedulePickerMode] = useState<"date" | "time">("date");
  const [schedulePickerDraft, setSchedulePickerDraft] = useState<Date>(new Date());
  const [taskTimeByTaskId, setTaskTimeByTaskId] = useState<Record<string, TaskTimeSummary>>({});
  const [taskTimeLoadingByTaskId, setTaskTimeLoadingByTaskId] = useState<Record<string, boolean>>({});
  const [addTimeModalOpen, setAddTimeModalOpen] = useState(false);
  const [addTimeTarget, setAddTimeTarget] = useState<{ milestoneId: string; taskId: string; taskText: string } | null>(null);
  const [addTimeDurationMinutes, setAddTimeDurationMinutes] = useState("");
  const [addTimeNote, setAddTimeNote] = useState("");
  const [timeLogModalOpen, setTimeLogModalOpen] = useState(false);
  const [timeLogTarget, setTimeLogTarget] = useState<{ milestoneId: string; taskId: string; taskText: string } | null>(null);
  const [pendingFocusItem, setPendingFocusItem] = useState<{ id: string; type: "MILESTONE" | "TASK" } | null>(null);

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

  const associatedCategoryIdsForCreate = useMemo(
    () => Array.from(new Set([...projects.map((project) => project.categoryId), ...myClubs.map((club) => club.categoryId)])),
    [projects, myClubs]
  );

  function formatProjectVisibilityLabel(visibility: ProjectVisibility): string {
    switch (visibility) {
      case "PUBLIC":
        return "Public";
      case "PRIVATE":
        return "Private";
      case "CLUB_MEMBERS":
        return "Club Members";
      case "CLUB_MODERATORS":
        return "Club Moderators";
      case "CLUB_OWNER_ONLY":
        return "Club Owner Only";
      default:
        return visibility;
    }
  }

  function normalizeProjectVisibility(visibility: string | undefined): ProjectVisibility | "UNKNOWN" {
    if (
      visibility === "PUBLIC" ||
      visibility === "PRIVATE" ||
      visibility === "CLUB_MEMBERS" ||
      visibility === "CLUB_MODERATORS" ||
      visibility === "CLUB_OWNER_ONLY"
    ) {
      return visibility;
    }
    return "UNKNOWN";
  }

  function renderVisibilityBadge(rawVisibility: string | undefined) {
    const visibility = normalizeProjectVisibility(rawVisibility);
    const label = visibility === "UNKNOWN" ? "Unknown" : formatProjectVisibilityLabel(visibility);
    const badgeStyle =
      visibility === "PUBLIC"
        ? styles.visibilityBadgePublic
        : visibility === "PRIVATE"
          ? styles.visibilityBadgePrivate
          : visibility === "CLUB_MEMBERS"
            ? styles.visibilityBadgeMembers
            : visibility === "CLUB_MODERATORS"
              ? styles.visibilityBadgeModerators
              : visibility === "CLUB_OWNER_ONLY"
                ? styles.visibilityBadgeOwner
                : styles.visibilityBadgeUnknown;

    return (
      <View style={[styles.visibilityBadge, badgeStyle]}>
        <Text style={styles.visibilityBadgeText}>{label}</Text>
      </View>
    );
  }

  const createVisibilityOptions = useMemo(() => {
    if (createAs === "USER") {
      return ["PUBLIC", "PRIVATE"] as ProjectVisibility[];
    }

    const selectedClub = myClubs.find((club) => club.id === selectedClubId);
    if (!selectedClub) {
      return ["PUBLIC"] as ProjectVisibility[];
    }

    if (selectedClub.isPublic === false) {
      return ["CLUB_MEMBERS", "CLUB_MODERATORS", "CLUB_OWNER_ONLY"] as ProjectVisibility[];
    }

    return ["PUBLIC", "CLUB_MEMBERS", "CLUB_MODERATORS", "CLUB_OWNER_ONLY"] as ProjectVisibility[];
  }, [createAs, myClubs, selectedClubId]);

  useEffect(() => {
    if (!createVisibilityOptions.includes(createVisibility)) {
      setCreateVisibility(createVisibilityOptions[0]);
    }
  }, [createVisibility, createVisibilityOptions]);

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

  useEffect(() => {
    if (!focusItemId || !focusItemType) return;
    logFocusDebug("incoming focus item", { focusItemId, focusItemType });
    setPendingFocusItem({ id: focusItemId, type: focusItemType });
  }, [focusItemId, focusItemType]);

  useEffect(() => {
    if (!focusProjectId || projects.length === 0) return;
    const target = projects.find((project) => project.id === focusProjectId);
    if (!target) return;
    if (selectedProject?.id === target.id) return;
    if (!focusItemId || !focusItemType) {
      triggerProjectHighlight(target.id);
    }
    onFocusProjectConsumed?.(target.id);
    void openProject(target);
  }, [focusProjectId, focusItemId, focusItemType, onFocusProjectConsumed, projects, selectedProject?.id]);

  useEffect(() => {
    if (!selectedProject || !pendingFocusItem) return;

    const targetExists =
      pendingFocusItem.type === "MILESTONE"
        ? orderedMilestones.some((milestone) => milestone.id === pendingFocusItem.id)
        : orderedMilestones.some((milestone) => milestone.tasks.some((task) => task.id === pendingFocusItem.id));

    if (!targetExists) return;

    if (projectTab !== "MILESTONES") {
      logFocusDebug("switching project tab to milestones before focus scroll", pendingFocusItem);
      setProjectTab("MILESTONES");
      return;
    }

    const key = `${pendingFocusItem.type}:${pendingFocusItem.id}`;
    const targetMilestoneId =
      pendingFocusItem.type === "MILESTONE"
        ? pendingFocusItem.id
        : orderedMilestones.find((milestone) => milestone.tasks.some((task) => task.id === pendingFocusItem.id))?.id;

    const scrollIndex =
      pendingFocusItem.type === "MILESTONE"
        ? orderedMilestones.findIndex((m) => m.id === pendingFocusItem.id)
        : orderedMilestones.findIndex((m) => m.tasks.some((t) => t.id === pendingFocusItem.id));

    logFocusDebug("resolved focus target", {
      pendingFocusItem,
      targetMilestoneId,
      scrollIndex,
      targetExists
    });

    const completeFocus = () => {
      setTimeout(() => {
        logFocusDebug("triggering nested highlight", key);
        triggerNestedItemHighlight(key);
      }, 180);
      onFocusItemConsumed?.(pendingFocusItem.id, pendingFocusItem.type);
      setPendingFocusItem(null);
    };

    const scrollToTargetWhenReady = (attempt = 0) => {
      const targetOffset = targetMilestoneId ? milestoneOffsetByIdRef.current[targetMilestoneId] : undefined;
      logFocusDebug("scroll readiness check", { attempt, targetMilestoneId, targetOffset, scrollIndex });
      if (targetOffset === undefined) {
        if (attempt >= 10) {
          if (scrollIndex >= 0) {
            pendingScrollIndexRef.current = scrollIndex;
            logFocusDebug("offset unavailable after retries; falling back to scrollToIndex", { scrollIndex });
            milestonesListRef.current?.scrollToIndex({ index: scrollIndex, animated: true, viewPosition: 0.3 });
          }
          completeFocus();
          return;
        }

        focusScrollRetryTimeoutRef.current = setTimeout(() => {
          scrollToTargetWhenReady(attempt + 1);
        }, 80);
        return;
      }

      InteractionManager.runAfterInteractions(() => {
        logFocusDebug("scrolling via offset", { targetOffset, adjustedOffset: Math.max(0, targetOffset - 120) });
        milestonesListRef.current?.scrollToOffset({
          offset: Math.max(0, targetOffset - 120),
          animated: true
        });
        completeFocus();
      });
    };

    scrollToTargetWhenReady();
  }, [
    onFocusItemConsumed,
    orderedMilestones,
    pendingFocusItem,
    projectTab,
    selectedProject,
    triggerNestedItemHighlight
  ]);

  useEffect(() => {
    return () => {
      if (focusScrollRetryTimeoutRef.current) {
        clearTimeout(focusScrollRetryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setSelectedProject(null);
    setTaskTimeByTaskId({});
    setTaskTimeLoadingByTaskId({});
  }, [rootResetSignal]);

  function formatDurationMinutes(totalMinutes: number): string {
    if (totalMinutes <= 0) return "0m";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (!hours) return `${minutes}m`;
    if (!minutes) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }

  async function refreshTaskTime(projectId: string, milestoneId: string, taskId: string) {
    setTaskTimeLoadingByTaskId((prev) => ({ ...prev, [taskId]: true }));
    try {
      const payload = await getTaskTimeEntries({
        projectId,
        milestoneId,
        taskId,
        viewerId: user.userId
      });
      setTaskTimeByTaskId((prev) => ({
        ...prev,
        [taskId]: {
          entries: payload.entries,
          taskTotalMinutes: payload.taskTotalMinutes
        }
      }));
    } finally {
      setTaskTimeLoadingByTaskId((prev) => ({ ...prev, [taskId]: false }));
    }
  }

  async function loadTaskTimesForMilestones(projectId: string, milestones: ProjectMilestone[]) {
    const calls = milestones.flatMap((milestone) =>
      (milestone.tasks ?? []).map((task) => refreshTaskTime(projectId, milestone.id, task.id))
    );
    await Promise.all(calls);
  }

  async function refreshProjectDetails(project: Project) {
    setProjectDetailLoading(true);
    try {
      const [highlights, milestones, links] = await Promise.all([
        getProjectHighlights(project.id),
        getProjectMilestones(project.id),
        getProjectClubLinks(project.id, user.userId)
      ]);
      setProjectHighlights(highlights);
      const normalizedMilestones = milestones.map((item, index) => ({
        ...item,
        order: typeof item.order === "number" ? item.order : index + 1,
        tasks: Array.isArray(item.tasks) ? item.tasks : []
      }));
      setProjectMilestones(normalizedMilestones);
      setProjectClubLinks(links);
      setTaskTimeByTaskId({});
      setTaskTimeLoadingByTaskId({});
      void loadTaskTimesForMilestones(project.id, normalizedMilestones).catch((err) => {
        setMessage((err as Error).message);
      });
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

  function openAddTimeModal(milestoneId: string, task: ProjectMilestoneTask) {
    setAddTimeTarget({ milestoneId, taskId: task.id, taskText: task.text });
    setAddTimeDurationMinutes("");
    setAddTimeNote("");
    setAddTimeModalOpen(true);
  }

  async function handleSaveTaskTimeEntry() {
    if (!selectedProject || !addTimeTarget) return;
    const parsedDuration = Number(addTimeDurationMinutes);
    if (!Number.isInteger(parsedDuration) || parsedDuration <= 0) {
      setMessage("Duration must be a positive whole number of minutes.");
      return;
    }

    try {
      await createTaskTimeEntry({
        projectId: selectedProject.id,
        milestoneId: addTimeTarget.milestoneId,
        taskId: addTimeTarget.taskId,
        actorId: user.userId,
        durationMinutes: parsedDuration,
        note: addTimeNote.trim() || undefined
      });
      setAddTimeModalOpen(false);
      setAddTimeTarget(null);
      setAddTimeDurationMinutes("");
      setAddTimeNote("");
      await refreshTaskTime(selectedProject.id, addTimeTarget.milestoneId, addTimeTarget.taskId);
      setMessage("Time entry added.");
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function openTimeLogModal(milestoneId: string, task: ProjectMilestoneTask) {
    if (!selectedProject) return;
    setTimeLogTarget({ milestoneId, taskId: task.id, taskText: task.text });
    setTimeLogModalOpen(true);
    try {
      await refreshTaskTime(selectedProject.id, milestoneId, task.id);
    } catch (err) {
      setMessage((err as Error).message);
    }
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

  function getMilestoneVisualState(milestone: ProjectMilestone, index: number): MilestoneVisualState {
    if (milestone.status === "DONE") return "COMPLETED";
    if (firstOpenMilestoneIndex === -1) return "FUTURE";
    if (index === firstOpenMilestoneIndex) return "IN_PROGRESS";
    return "FUTURE";
  }

  function parseIsoToDate(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatScheduleValue(value?: string): string | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleString();
  }

  function formatDateTimeLocalValue(value: Date | null): string {
    if (!value) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    const hours = String(value.getHours()).padStart(2, "0");
    const minutes = String(value.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  function parseDateTimeLocalValue(raw: string): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function setScheduleField(field: "start" | "due", value: Date | null) {
    if (field === "start") {
      setScheduleEditorStartAt(value);
      return;
    }
    setScheduleEditorDueAt(value);
  }

  function openSchedulePicker(field: "start" | "due") {
    const baseValue = field === "start" ? scheduleEditorStartAt ?? new Date() : scheduleEditorDueAt ?? scheduleEditorStartAt ?? new Date();

    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: baseValue,
        mode: "date",
        is24Hour: true,
        onChange: (dateEvent, pickedDate) => {
          if (dateEvent.type === "dismissed" || !pickedDate) return;

          const withDate = new Date(baseValue);
          withDate.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());

          DateTimePickerAndroid.open({
            value: withDate,
            mode: "time",
            is24Hour: true,
            onChange: (timeEvent, pickedTime) => {
              if (timeEvent.type === "dismissed" || !pickedTime) return;
              const combined = new Date(withDate);
              combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
              setScheduleField(field, combined);
            }
          });
        }
      });
      return;
    }

    setSchedulePickerField(field);
    setSchedulePickerMode("date");
    setSchedulePickerDraft(baseValue);
    setSchedulePickerOpen(true);
  }

  function handleSchedulePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (event.type === "dismissed") {
      setSchedulePickerOpen(false);
      setSchedulePickerMode("date");
      return;
    }

    if (!selectedDate) return;

    if (schedulePickerMode === "date") {
      setSchedulePickerDraft(selectedDate);
      setSchedulePickerMode("time");
      return;
    }

    const combined = new Date(schedulePickerDraft);
    combined.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
    setScheduleField(schedulePickerField, combined);
    setSchedulePickerOpen(false);
    setSchedulePickerMode("date");
  }

  function openMilestoneScheduleEditor(item: ProjectMilestone) {
    setScheduleEditorTarget({ kind: "MILESTONE", milestoneId: item.id, label: item.title });
    setScheduleEditorStartAt(parseIsoToDate(item.startAt));
    setScheduleEditorDueAt(parseIsoToDate(item.dueAt));
    setScheduleEditorOpen(true);
  }

  function openTaskScheduleEditor(milestone: ProjectMilestone, task: ProjectMilestoneTask) {
    setScheduleEditorTarget({ kind: "TASK", milestoneId: milestone.id, taskId: task.id, label: task.text });
    setScheduleEditorStartAt(parseIsoToDate(task.startAt));
    setScheduleEditorDueAt(parseIsoToDate(task.dueAt));
    setScheduleEditorOpen(true);
  }

  async function handleSaveScheduleEditor() {
    if (!selectedProject || !scheduleEditorTarget) return;

    const startAtIso = scheduleEditorStartAt ? scheduleEditorStartAt.toISOString() : null;
    const dueAtIso = scheduleEditorDueAt ? scheduleEditorDueAt.toISOString() : null;

    try {
      if (scheduleEditorTarget.kind === "MILESTONE") {
        await updateProjectMilestone({
          projectId: selectedProject.id,
          milestoneId: scheduleEditorTarget.milestoneId,
          actorId: user.userId,
          startAt: startAtIso,
          dueAt: dueAtIso
        });
      } else {
        await updateProjectMilestoneTask({
          projectId: selectedProject.id,
          milestoneId: scheduleEditorTarget.milestoneId,
          taskId: scheduleEditorTarget.taskId,
          actorId: user.userId,
          startAt: startAtIso,
          dueAt: dueAtIso
        });
      }

      setScheduleEditorOpen(false);
      setScheduleEditorTarget(null);
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function clearScheduleField(field: "start" | "due") {
    if (field === "start") {
      setScheduleEditorStartAt(null);
      return;
    }
    setScheduleEditorDueAt(null);
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
        description: description.trim() || undefined,
        visibility: createVisibility
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
      const milestone = await createProjectMilestone({
        projectId: selectedProject.id,
        actorId: user.userId,
        title: newMilestoneTitle.trim()
      });

      if (newMilestoneTaskDrafts.length > 0) {
        for (const taskText of newMilestoneTaskDrafts) {
          await createProjectMilestoneTask({
            projectId: selectedProject.id,
            milestoneId: milestone.id,
            actorId: user.userId,
            text: taskText
          });
        }
      }

      setNewMilestoneTitle("");
      setNewMilestoneTaskDraft("");
      setNewMilestoneTaskDrafts([]);
      setMilestoneModalOpen(false);
      await refreshProjectDetails(selectedProject);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function handleAddMilestoneTaskDraft() {
    const normalized = newMilestoneTaskDraft.trim();
    if (!normalized) return;
    setNewMilestoneTaskDrafts((prev) => [...prev, normalized]);
    setNewMilestoneTaskDraft("");
  }

  function handleRemoveMilestoneTaskDraft(index: number) {
    setNewMilestoneTaskDrafts((prev) => prev.filter((_, draftIndex) => draftIndex !== index));
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

    const createMilestoneModal = (
      <Modal visible={milestoneModalOpen} transparent animationType="fade" onRequestClose={() => setMilestoneModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMilestoneModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Create Milestone</Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <TextInput
                value={newMilestoneTitle}
                onChangeText={setNewMilestoneTitle}
                placeholder="Milestone name"
                style={styles.input}
              />

              <Text style={styles.label}>Optional Tasks</Text>
              <TextInput
                value={newMilestoneTaskDraft}
                onChangeText={setNewMilestoneTaskDraft}
                placeholder="Add a task before create"
                style={styles.input}
              />
              <Pressable onPress={handleAddMilestoneTaskDraft} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Add Task Draft</Text>
              </Pressable>

              <View style={styles.taskListBlock}>
                {newMilestoneTaskDrafts.length === 0 ? <Text style={styles.hint}>No task drafts added.</Text> : null}
                {newMilestoneTaskDrafts.map((taskText, index) => (
                  <View key={`new-milestone-task-${index}`} style={styles.modalTaskDraftRow}>
                    <Text style={styles.taskText}>• {taskText}</Text>
                    <Pressable onPress={() => handleRemoveMilestoneTaskDraft(index)} style={styles.pill}>
                      <Text style={styles.pillText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.rowWrap}>
              <Pressable onPress={handleCreateMilestone} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Create Milestone</Text>
              </Pressable>
              <Pressable onPress={() => setMilestoneModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );

    const scheduleEditorModal = (
      <Modal visible={scheduleEditorOpen} transparent animationType="fade" onRequestClose={() => setScheduleEditorOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setScheduleEditorOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Edit Schedule</Text>
            <Text style={styles.hint}>{scheduleEditorTarget ? scheduleEditorTarget.label : ""}</Text>

            <Text style={styles.label}>Start</Text>
            {Platform.OS === "web" ? (
              <input
                type="datetime-local"
                value={formatDateTimeLocalValue(scheduleEditorStartAt)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setScheduleEditorStartAt(parseDateTimeLocalValue(event.target.value))}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  width: "100%",
                  boxSizing: "border-box"
                }}
              />
            ) : (
              <Pressable onPress={() => openSchedulePicker("start")} style={styles.input}>
                <Text>{scheduleEditorStartAt ? scheduleEditorStartAt.toLocaleString() : "Select start"}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => clearScheduleField("start")} style={styles.pill}>
              <Text style={styles.pillText}>Clear Start</Text>
            </Pressable>

            <Text style={styles.label}>Due</Text>
            {Platform.OS === "web" ? (
              <input
                type="datetime-local"
                value={formatDateTimeLocalValue(scheduleEditorDueAt)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setScheduleEditorDueAt(parseDateTimeLocalValue(event.target.value))}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  width: "100%",
                  boxSizing: "border-box"
                }}
              />
            ) : (
              <Pressable onPress={() => openSchedulePicker("due")} style={styles.input}>
                <Text>{scheduleEditorDueAt ? scheduleEditorDueAt.toLocaleString() : "Select due"}</Text>
              </Pressable>
            )}
            <Pressable onPress={() => clearScheduleField("due")} style={styles.pill}>
              <Text style={styles.pillText}>Clear Due</Text>
            </Pressable>

            <View style={styles.rowWrap}>
              <Pressable onPress={handleSaveScheduleEditor} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setScheduleEditorOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>

            {Platform.OS === "ios" && schedulePickerOpen ? (
              <DateTimePicker
                value={schedulePickerDraft}
                mode={schedulePickerMode}
                is24Hour
                onChange={handleSchedulePickerChange}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    );

    const addTimeModal = (
      <Modal visible={addTimeModalOpen} transparent animationType="fade" onRequestClose={() => setAddTimeModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddTimeModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Add Time</Text>
            <Text style={styles.hint}>{addTimeTarget?.taskText ?? ""}</Text>
            <TextInput
              value={addTimeDurationMinutes}
              onChangeText={setAddTimeDurationMinutes}
              placeholder="Duration minutes"
              keyboardType="number-pad"
              style={styles.input}
            />
            <TextInput
              value={addTimeNote}
              onChangeText={setAddTimeNote}
              placeholder="Note (optional)"
              style={styles.input}
            />
            <View style={styles.rowWrap}>
              <Pressable onPress={handleSaveTaskTimeEntry} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setAddTimeModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );

    const timeLogEntries = timeLogTarget ? taskTimeByTaskId[timeLogTarget.taskId]?.entries ?? [] : [];
    const timeLogModal = (
      <Modal visible={timeLogModalOpen} transparent animationType="fade" onRequestClose={() => setTimeLogModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTimeLogModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Task Time Log</Text>
            <Text style={styles.hint}>{timeLogTarget?.taskText ?? ""}</Text>
            <ScrollView style={styles.modalList}>
              {timeLogEntries.length === 0 ? <Text style={styles.hint}>No time entries yet.</Text> : null}
              {timeLogEntries.map((entry) => (
                <View key={entry.id} style={styles.modalListItem}>
                  <Text style={styles.modalListItemTitle}>{formatDurationMinutes(entry.durationMinutes)}</Text>
                  {entry.note ? <Text>{entry.note}</Text> : null}
                  <Text style={styles.hint}>{new Date(entry.createdAt).toLocaleString()}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.rowWrap}>
              <Pressable onPress={() => setTimeLogModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    );

    const detailHeader = (
      <View>
        <Pressable
          onPress={() => {
            setSelectedProject(null);
            onBackToProjectsRoot?.();
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>← Back to Projects</Text>
        </Pressable>
        <Animated.View
          style={[
            styles.card,
            highlightedProjectId === selectedProject.id ? styles.focusedTargetCard : null,
            highlightedProjectId === selectedProject.id ? projectEmphasisAnimatedStyle : null
          ]}
        >
          <Text style={styles.sectionTitle}>{selectedProject.title}</Text>
          <Text style={styles.hint}>{selectedProject.description || "No description"}</Text>
          <View style={styles.visibilityRow}>
            <Text style={styles.hint}>Visibility:</Text>
            {renderVisibilityBadge(selectedProject.visibility)}
          </View>

          <View style={styles.clubPanel}>
            <Text style={styles.activeMilestoneTitle}>Clubs</Text>
            {approvedLinks.length === 0 ? <Text style={styles.hint}>Not attached to any clubs yet.</Text> : null}
            {approvedLinks.map((link) => (
              <Pressable
                key={`approved-${link.clubId}`}
                onPress={() => onNavigateToClub?.(link.clubId)}
                style={styles.inlineLinkRow}
              >
                <Text style={styles.inlineLinkText}>• {link.club?.name ?? link.clubId} (approved) • Open</Text>
              </Pressable>
            ))}

            <Pressable onPress={() => handleOpenRequestClubModal(linkableClubs)} style={styles.buttonInline}>
              <Text style={styles.buttonText}>Request to Add Club</Text>
            </Pressable>
            {linkableClubs.length === 0 ? <Text style={styles.hint}>No additional clubs available for this project.</Text> : null}

            {pendingLinks.length > 0 ? <Text style={styles.label}>Pending Requests</Text> : null}
            {pendingLinks.map((link) => (
              <View key={`pending-${link.clubId}`} style={styles.pendingCard}>
                <Pressable
                  onPress={() => onNavigateToClub?.(link.clubId)}
                  style={styles.inlineLinkRow}
                >
                  <Text style={styles.inlineLinkText}>• {link.club?.name ?? link.clubId} (pending) • Open</Text>
                </Pressable>
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
                {formatScheduleValue(activeMilestone.startAt) ? <Text style={styles.hint}>Start: {formatScheduleValue(activeMilestone.startAt)}</Text> : null}
                {formatScheduleValue(activeMilestone.dueAt) ? <Text style={styles.hint}>Due: {formatScheduleValue(activeMilestone.dueAt)}</Text> : null}
                {(activeMilestone.tasks ?? []).length === 0 ? <Text style={styles.hint}>No tasks yet.</Text> : null}
                {(activeMilestone.tasks ?? []).map((task) => (
                  <View key={task.id} style={styles.activeMilestoneTaskBlock}>
                    <Text style={styles.hint}>{task.isDone ? "☑" : "☐"} {task.text}</Text>
                    {formatScheduleValue(task.startAt) ? <Text style={styles.hint}>Start: {formatScheduleValue(task.startAt)}</Text> : null}
                    {formatScheduleValue(task.dueAt) ? <Text style={styles.hint}>Due: {formatScheduleValue(task.dueAt)}</Text> : null}
                  </View>
                ))}
              </>
            ) : (
              <Text style={styles.hint}>All milestones completed 🎉</Text>
            )}
          </View>
        </Animated.View>
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
          ref={milestonesListRef}
          data={orderedMilestones}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={(info) => {
            const requestedIndex = pendingScrollIndexRef.current ?? info.index;
            const safeIndex = Math.max(0, Math.min(requestedIndex, info.highestMeasuredFrameIndex + 1));
            logFocusDebug("scrollToIndex failed", {
              requestedIndex,
              highestMeasuredFrameIndex: info.highestMeasuredFrameIndex,
              averageItemLength: info.averageItemLength,
              safeIndex
            });

            milestonesListRef.current?.scrollToIndex({
              index: safeIndex,
              animated: true,
              viewPosition: 0.3
            });

            setTimeout(() => {
              logFocusDebug("retrying scrollToIndex after failure", { requestedIndex });
              milestonesListRef.current?.scrollToIndex({
                index: requestedIndex,
                animated: true,
                viewPosition: 0.3
              });
            }, 180);
          }}
          ListHeaderComponent={
            <View>
              {detailHeader}
              <View style={styles.card}>
                <Pressable onPress={() => setMilestoneModalOpen(true)} style={styles.button}>
                  <Text style={styles.buttonText}>Create Milestone</Text>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const visualState = getMilestoneVisualState(item, index);
            const cardStyle = visualState === "COMPLETED" ? styles.milestoneDone : visualState === "IN_PROGRESS" ? styles.milestoneActive : styles.milestoneFuture;
            const canToggleToDone = item.status === "DONE" || visualState !== "FUTURE";

            const milestoneFocusKey = `MILESTONE:${item.id}`;

            return (
              <Animated.View
                onLayout={(event) => {
                  milestoneOffsetByIdRef.current[item.id] = event.nativeEvent.layout.y;
                  logFocusDebug("milestone layout measured", {
                    milestoneId: item.id,
                    y: event.nativeEvent.layout.y
                  });
                }}
                style={[
                  styles.card,
                  cardStyle,
                  highlightedNestedItemId === milestoneFocusKey ? styles.focusedMilestoneItem : null,
                  highlightedNestedItemId === milestoneFocusKey ? nestedItemEmphasisAnimatedStyle : null,
                  highlightedNestedItemId === milestoneFocusKey ? nestedItemGlowAnimatedStyle : null
                ]}
              >
                <Text style={styles.title}>{item.order}. {item.title}</Text>
                <Text style={styles.hint}>State: {visualState === "COMPLETED" ? "Completed" : visualState === "IN_PROGRESS" ? "In Progress" : "Future"}</Text>
                {formatScheduleValue(item.startAt) ? <Text style={styles.hint}>Start: {formatScheduleValue(item.startAt)}</Text> : null}
                {formatScheduleValue(item.dueAt) ? <Text style={styles.hint}>Due: {formatScheduleValue(item.dueAt)}</Text> : null}
                <Pressable onPress={() => openMilestoneScheduleEditor(item)} style={styles.buttonInline}>
                  <Text style={styles.buttonText}>Edit Schedule</Text>
                </Pressable>

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
                  {(item.tasks ?? []).map((task) => {
                    const taskFocusKey = `TASK:${task.id}`;
                    return (
                    <Animated.View
                      key={task.id}
                      style={[
                        styles.taskItemBlock,
                        highlightedNestedItemId === taskFocusKey ? styles.focusedTaskItem : null,
                        highlightedNestedItemId === taskFocusKey ? nestedItemEmphasisAnimatedStyle : null,
                        highlightedNestedItemId === taskFocusKey ? nestedItemGlowAnimatedStyle : null
                      ]}
                    >
                      <Pressable onPress={() => toggleMilestoneTask(item.id, task)} style={styles.taskRow}>
                        <View style={[styles.taskCheckbox, task.isDone && styles.taskCheckboxDone]}>
                          {task.isDone ? <Text style={styles.taskCheckboxMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.taskText}>{task.text}</Text>
                      </Pressable>
                      {formatScheduleValue(task.startAt) ? <Text style={styles.hint}>Start: {formatScheduleValue(task.startAt)}</Text> : null}
                      {formatScheduleValue(task.dueAt) ? <Text style={styles.hint}>Due: {formatScheduleValue(task.dueAt)}</Text> : null}
                      {taskTimeByTaskId[task.id]?.taskTotalMinutes > 0 ? (
                        <Text style={styles.hint}>Total: {formatDurationMinutes(taskTimeByTaskId[task.id].taskTotalMinutes)}</Text>
                      ) : null}
                      {taskTimeLoadingByTaskId[task.id] ? <Text style={styles.hint}>Loading time…</Text> : null}
                      <View style={styles.rowWrap}>
                        <Pressable onPress={() => openAddTimeModal(item.id, task)} style={styles.pill}>
                          <Text style={styles.pillText}>Add Time</Text>
                        </Pressable>
                        <Pressable onPress={() => openTimeLogModal(item.id, task)} style={styles.pill}>
                          <Text style={styles.pillText}>View Log</Text>
                        </Pressable>
                      </View>
                      <Pressable onPress={() => openTaskScheduleEditor(item, task)} style={styles.pill}>
                        <Text style={styles.pillText}>Edit Schedule</Text>
                      </Pressable>
                    </Animated.View>
                  );})}
                </View>
              </Animated.View>
            );
          }}
        />
        {requestClubModal}
        {createMilestoneModal}
        {scheduleEditorModal}
        {addTimeModal}
        {timeLogModal}
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
            <View style={styles.visibilityRow}>
              <Text style={styles.hint}>Visibility:</Text>
              {renderVisibilityBadge(item.visibility)}
            </View>
          </Pressable>
        )}
      />

      <Modal visible={createModalOpen} transparent animationType="fade" onRequestClose={() => setCreateModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Create Project</Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
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

              <CategorySelectorField
                label="Project Category"
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                associatedCategoryIds={associatedCategoryIdsForCreate}
                onSelectCategory={setSelectedCategoryId}
              />

              <TextInput value={title} onChangeText={setTitle} placeholder="Project title" style={styles.input} />
              <TextInput value={description} onChangeText={setDescription} placeholder="Project description" style={styles.input} />

              <Text style={styles.label}>Visibility</Text>
              <View style={styles.rowWrap}>
                {createVisibilityOptions.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => setCreateVisibility(option)}
                    style={[styles.pill, createVisibility === option && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, createVisibility === option && styles.pillTextActive]}>
                      {formatProjectVisibilityLabel(option)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
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
  modalScroll: { maxHeight: 440 },
  modalScrollContent: { paddingBottom: 4 },
  milestoneDone: { borderColor: "#1b8f3c", backgroundColor: "#f0fff4" },
  milestoneActive: { borderColor: "#0b57d0", backgroundColor: "#f3f8ff" },
  milestoneFuture: { borderColor: "#b0b0b0", backgroundColor: "#f7f7f7" },
  activeMilestoneBox: { marginTop: 6, borderWidth: 1, borderColor: "#d9d9d9", borderRadius: 8, padding: 8 },
  activeMilestoneTitle: { fontWeight: "700", marginBottom: 4 },
  activeMilestoneTaskBlock: { marginTop: 4 },
  taskRow: { paddingVertical: 3, flexDirection: "row", alignItems: "center" }
  ,
  taskItemBlock: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 8,
    backgroundColor: "#fff"
  },
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
  modalListItemTitle: { fontWeight: "600", marginBottom: 4 },
  inlineLinkRow: { paddingVertical: 3 },
  inlineLinkText: { color: "#0b57d0", fontWeight: "600" },
  modalTaskDraftRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    marginBottom: 8
  },
  focusedTargetCard: {
    borderColor: "#9bb8f5",
    borderWidth: 1,
    backgroundColor: "#f6f9ff"
  },
  focusedMilestoneItem: {
    borderColor: "#f59e0b",
    borderWidth: 2
  },
  focusedTaskItem: {
    borderColor: "#f59e0b",
    borderWidth: 2,
    borderRadius: 10,
    backgroundColor: "#fff8eb"
  },
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6
  },
  visibilityBadge: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderWidth: 1
  },
  visibilityBadgeText: {
    fontSize: 11,
    fontWeight: "700"
  },
  visibilityBadgePublic: {
    backgroundColor: "#e8f6ee",
    borderColor: "#86d2a7"
  },
  visibilityBadgePrivate: {
    backgroundColor: "#fdecec",
    borderColor: "#f3a7a7"
  },
  visibilityBadgeMembers: {
    backgroundColor: "#eaf1ff",
    borderColor: "#a8c2ff"
  },
  visibilityBadgeModerators: {
    backgroundColor: "#fff4e5",
    borderColor: "#ffd08a"
  },
  visibilityBadgeOwner: {
    backgroundColor: "#f3ecff",
    borderColor: "#c8b1ff"
  },
  visibilityBadgeUnknown: {
    backgroundColor: "#f2f2f2",
    borderColor: "#cccccc"
  }
});
