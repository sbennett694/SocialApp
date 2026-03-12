import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid, DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Calendar, DateData } from "react-native-calendars";
import {
  Club,
  ClubEvent,
  ClubHistoryEvent,
  ClubJoinPolicy,
  ClubJoinRequest,
  ClubMember,
  createClubJoinRequest,
  createClubEvent,
  createPost,
  createClub,
  getCategories,
  getClubEvents,
  getClubHistory,
  getClubJoinRequests,
  getClubJoinRequestStatus,
  getProjectClubLinks,
  getClubMembers,
  getClubProjects,
  getClubsFeed,
  getProjects,
  getUserClubs,
  joinClub,
  Post,
  Project,
  ProjectClubLink,
  reviewProjectClubLink,
  reviewClubJoinRequest,
  searchClubs,
  updateClubMemberRole,
  updateClub
} from "../api/client";
import { AuthUser } from "../auth/session";
import { CategorySelectorField } from "../components/CategorySelectorField";
import { useTemporaryHighlight } from "../lib/useTemporaryHighlight";

type ClubsScreenProps = {
  user: AuthUser;
  rootResetSignal?: number;
  focusClubId?: string;
  focusClubPostId?: string;
  onFocusClubConsumed?: (clubId: string) => void;
  onFocusClubPostConsumed?: (postId: string) => void;
  onBackToClubsRoot?: () => void;
  onNavigateToProject?: (projectId: string) => void;
};

type ClubProjectRequest = {
  project: Project;
  link: ProjectClubLink;
};

type ClubAdminStats = {
  canManage: boolean;
  membersCount: number;
  pendingJoinRequestsCount: number;
};

type ClubStatsSummary = {
  membersCount: number;
  pendingJoinRequestsCount: number;
  totalHighlightsCount: number;
};

function formatProjectVisibilityLabel(visibility: string): string {
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
      return "Unknown";
  }
}

function formatClubVisibilityLabel(isPublic: boolean | undefined): string {
  return isPublic === false ? "Private Club" : "Public Club";
}

function resolveEffectiveJoinPolicy(club: Club): ClubJoinPolicy {
  if (club.joinPolicy === "OPEN" || club.joinPolicy === "REQUEST_REQUIRED" || club.joinPolicy === "INVITE_ONLY") {
    return club.joinPolicy;
  }
  return club.isPublic === false ? "INVITE_ONLY" : "OPEN";
}

function formatJoinPolicyLabel(policy: ClubJoinPolicy): string {
  switch (policy) {
    case "OPEN":
      return "Open";
    case "REQUEST_REQUIRED":
      return "Request Required";
    case "INVITE_ONLY":
      return "Invite Only";
    default:
      return "Open";
  }
}

export function ClubsScreen({
  user,
  rootResetSignal = 0,
  focusClubId,
  focusClubPostId,
  onFocusClubConsumed,
  onFocusClubPostConsumed,
  onBackToClubsRoot,
  onNavigateToProject
}: ClubsScreenProps) {
  const clubHighlightsListRef = useRef<FlatList<Post> | null>(null);
  const {
    highlightedId: highlightedClubId,
    triggerHighlight: triggerClubHighlight,
    emphasisAnimatedStyle: clubEmphasisAnimatedStyle
  } = useTemporaryHighlight(1800);
  const {
    highlightedId: highlightedClubPostId,
    triggerHighlight: triggerClubPostHighlight,
    emphasisAnimatedStyle: clubPostEmphasisAnimatedStyle,
    glowAnimatedStyle: clubPostGlowAnimatedStyle
  } = useTemporaryHighlight();
  const [clubsPageTab, setClubsPageTab] = useState<"MY_CLUBS" | "DISCOVER" | "CLUB_FEED">("MY_CLUBS");
  const [clubs, setClubs] = useState<Club[]>([]);
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [joinableClubs, setJoinableClubs] = useState<Club[]>([]);
  const [clubFeed, setClubFeed] = useState<Post[]>([]);
  const [detailClubFeed, setDetailClubFeed] = useState<Post[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const [clubSearch, setClubSearch] = useState("");
  const [discoverCategoryId, setDiscoverCategoryId] = useState("");
  const [discoverCategoryPickerOpen, setDiscoverCategoryPickerOpen] = useState(false);
  const [discoverCategorySearch, setDiscoverCategorySearch] = useState("");
  const [clubFeedFilterClubId, setClubFeedFilterClubId] = useState("");

  const [newClubTitle, setNewClubTitle] = useState("");
  const [newClubDescription, setNewClubDescription] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [newClubIsPublic, setNewClubIsPublic] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [editClubName, setEditClubName] = useState("");
  const [editClubDescription, setEditClubDescription] = useState("");
  const [editClubIsPublic, setEditClubIsPublic] = useState(true);
  const [editClubJoinPolicy, setEditClubJoinPolicy] = useState<ClubJoinPolicy>("OPEN");

  const [createEventModalOpen, setCreateEventModalOpen] = useState(false);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [newEventIsAllDay, setNewEventIsAllDay] = useState(false);
  const [newEventStartAt, setNewEventStartAt] = useState<Date | null>(null);
  const [newEventEndAt, setNewEventEndAt] = useState<Date | null>(null);
  const [newEventLocationText, setNewEventLocationText] = useState("");
  const [newEventVisibility, setNewEventVisibility] = useState<"CLUB_MEMBERS" | "PUBLIC_CLUB">("CLUB_MEMBERS");
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const [dateTimePickerTarget, setDateTimePickerTarget] = useState<"start" | "end">("start");
  const [dateTimePickerMode, setDateTimePickerMode] = useState<"date" | "time">("date");
  const [dateTimePickerDraft, setDateTimePickerDraft] = useState<Date>(new Date());

  const [viewingClub, setViewingClub] = useState<Club | null>(null);
  const [clubDetailTab, setClubDetailTab] = useState<"HIGHLIGHTS" | "MEMBERS" | "PROJECTS" | "PROJECT_REQUESTS" | "EVENTS" | "HISTORY">("HIGHLIGHTS");
  const [eventsViewMode, setEventsViewMode] = useState<"LIST" | "CALENDAR">("LIST");
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [clubProjects, setClubProjects] = useState<Project[]>([]);
  const [clubEvents, setClubEvents] = useState<ClubEvent[]>([]);
  const [clubHistoryEvents, setClubHistoryEvents] = useState<ClubHistoryEvent[]>([]);
  const [clubProjectRequests, setClubProjectRequests] = useState<ClubProjectRequest[]>([]);
  const [clubJoinRequests, setClubJoinRequests] = useState<ClubJoinRequest[]>([]);
  const [clubJoinRequestStatus, setClubJoinRequestStatus] = useState<ClubJoinRequest | null>(null);
  const [pendingJoinRequestClubIds, setPendingJoinRequestClubIds] = useState<string[]>([]);
  const [clubAdminStatsByClubId, setClubAdminStatsByClubId] = useState<Record<string, ClubAdminStats>>({});
  const [clubDetailLoading, setClubDetailLoading] = useState(false);
  const [clubHighlightText, setClubHighlightText] = useState("");
  const [pendingFocusClubPostId, setPendingFocusClubPostId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    setMessage(null);
    try {
      const [clubData, myClubData, joinableData, clubPosts, categoryData] = await Promise.all([
        searchClubs({ viewerId: user.userId, search: clubSearch }),
        getUserClubs(user.userId),
        searchClubs({ viewerId: user.userId, search: clubSearch, joinableOnly: true }),
        getClubsFeed(user.userId, clubFeedFilterClubId || undefined),
        getCategories()
      ]);

      setClubs(clubData);
      setMyClubs(myClubData);
      setJoinableClubs(joinableData);
      setClubFeed(clubPosts);
      setCategories(categoryData.categories);

      if (!selectedCategoryId && categoryData.categories.length > 0) {
        setSelectedCategoryId(categoryData.categories[0].id);
      }
      if (!discoverCategoryId && categoryData.categories.length > 0) {
        setDiscoverCategoryId(categoryData.categories[0].id);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [user.userId, clubSearch, clubFeedFilterClubId]);

  useEffect(() => {
    if (myClubs.length === 0) {
      setClubAdminStatsByClubId({});
      return;
    }

    let cancelled = false;

    async function loadClubAdminStats() {
      const entries = await Promise.all(
        myClubs.map(async (club) => {
          try {
            const members = await getClubMembers(club.id);
            const viewerRole = members.find((member) => member.userId === user.userId)?.role;
            const canManage = viewerRole === "OWNER" || viewerRole === "MODERATOR";

            if (!canManage) {
              return [
                club.id,
                {
                  canManage: false,
                  membersCount: members.length,
                  pendingJoinRequestsCount: 0
                } satisfies ClubAdminStats
              ] as const;
            }

            const joinRequests = await getClubJoinRequests(club.id, user.userId);
            return [
              club.id,
              {
                canManage: true,
                membersCount: members.length,
                pendingJoinRequestsCount: joinRequests.length
              } satisfies ClubAdminStats
            ] as const;
          } catch {
            return [
              club.id,
              {
                canManage: false,
                membersCount: 0,
                pendingJoinRequestsCount: 0
              } satisfies ClubAdminStats
            ] as const;
          }
        })
      );

      if (cancelled) return;
      setClubAdminStatsByClubId(Object.fromEntries(entries));
    }

    void loadClubAdminStats();

    return () => {
      cancelled = true;
    };
  }, [myClubs, user.userId]);

  useEffect(() => {
    setViewingClub(null);
    setClubFeedFilterClubId("");
    setClubsPageTab("MY_CLUBS");
  }, [rootResetSignal]);

  useEffect(() => {
    if (!focusClubId) return;
    const target = [...myClubs, ...clubs, ...joinableClubs].find((club) => club.id === focusClubId);
    if (!target) return;
    if (viewingClub?.id === target.id) return;
    if (!focusClubPostId) {
      triggerClubHighlight(target.id);
    }
    onFocusClubConsumed?.(target.id);
    void openClubDetail(target);
  }, [focusClubId, focusClubPostId, onFocusClubConsumed, myClubs, clubs, joinableClubs, viewingClub?.id]);

  useEffect(() => {
    if (!focusClubPostId) return;
    setPendingFocusClubPostId(focusClubPostId);
  }, [focusClubPostId]);

  useEffect(() => {
    if (!pendingFocusClubPostId || !viewingClub) return;
    const targetIndex = detailClubFeed.findIndex((post) => post.postId === pendingFocusClubPostId);
    if (targetIndex < 0) return;

    if (clubDetailTab !== "HIGHLIGHTS") {
      setClubDetailTab("HIGHLIGHTS");
      return;
    }

    setTimeout(() => {
      clubHighlightsListRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.3 });
    }, 150);
    triggerClubPostHighlight(pendingFocusClubPostId);
    onFocusClubPostConsumed?.(pendingFocusClubPostId);
    setPendingFocusClubPostId(null);
  }, [
    clubDetailTab,
    detailClubFeed,
    onFocusClubPostConsumed,
    pendingFocusClubPostId,
    triggerClubPostHighlight,
    viewingClub
  ]);

  async function handleJoinClub(club: Club) {
    try {
      const joinPolicy = resolveEffectiveJoinPolicy(club);
      if (joinPolicy === "OPEN") {
        await joinClub(club.id, user.userId);
        if (viewingClub?.id === club.id) {
          const joinedAt = new Date().toISOString();
          setClubMembers((current) => {
            if (current.some((member) => member.clubId === club.id && member.userId === user.userId)) {
              return current;
            }
            return [
              ...current,
              {
                clubId: club.id,
                userId: user.userId,
                role: "MEMBER",
                createdAt: joinedAt
              }
            ];
          });
          setClubJoinRequestStatus({
            clubId: club.id,
            userId: user.userId,
            status: "APPROVED",
            createdAt: joinedAt,
            resolvedAt: joinedAt,
            resolvedBy: user.userId
          });
        }
        setMessage(`Joined ${club.name}`);
      } else if (joinPolicy === "REQUEST_REQUIRED") {
        setPendingJoinRequestClubIds((current) => (current.includes(club.id) ? current : [...current, club.id]));
        if (viewingClub?.id === club.id) {
          setClubJoinRequestStatus({
            clubId: club.id,
            userId: user.userId,
            status: "PENDING",
            createdAt: new Date().toISOString()
          });
        }
        await createClubJoinRequest(club.id, user.userId);
        setMessage(`Request sent 🤞 to ${club.name}.`);
      } else {
        setMessage(`${club.name} is invite only.`);
      }
      loadData();
    } catch (err) {
      const joinPolicy = resolveEffectiveJoinPolicy(club);
      if (joinPolicy === "REQUEST_REQUIRED") {
        setPendingJoinRequestClubIds((current) => current.filter((clubId) => clubId !== club.id));
        if (viewingClub?.id === club.id) {
          setClubJoinRequestStatus((current) => (current?.status === "PENDING" ? null : current));
        }
      }
      setMessage((err as Error).message);
    }
  }

  async function handleCreateClub() {
    if (!newClubTitle.trim() || !selectedCategoryId) {
      setMessage("Club title and category are required.");
      return;
    }

    try {
      await createClub({
        ownerId: user.userId,
        categoryId: selectedCategoryId,
        name: newClubTitle.trim(),
        description: newClubDescription.trim() || undefined,
        isPublic: newClubIsPublic
      });
      setNewClubTitle("");
      setNewClubDescription("");
      setCreateModalOpen(false);
      setMessage("Club created successfully.");
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function openClubDetail(club: Club) {
    setViewingClub(club);
    setClubDetailTab("HIGHLIGHTS");
    setClubDetailLoading(true);
    try {
      const [members, projects, clubPosts, history, events] = await Promise.all([
        getClubMembers(club.id),
        getClubProjects(club.id),
        getClubsFeed(user.userId, club.id),
        getClubHistory(club.id, 50),
        getClubEvents(club.id, user.userId, "all")
      ]);
      setClubMembers(members);
      setClubProjects(projects);
      setDetailClubFeed(clubPosts);
      setClubHistoryEvents(history);
      setClubEvents(events);

      const viewerRole = members.find((member) => member.userId === user.userId)?.role;
      const canManage = viewerRole === "OWNER" || viewerRole === "MODERATOR";

      try {
        const joinStatus = await getClubJoinRequestStatus(club.id, user.userId);
        setClubJoinRequestStatus(joinStatus);
        if (joinStatus?.status === "PENDING") {
          setPendingJoinRequestClubIds((current) => (current.includes(club.id) ? current : [...current, club.id]));
        }
      } catch (err) {
        const message = (err as Error).message || "";
        if (message.includes("404")) {
          setClubJoinRequestStatus(null);
        } else {
          throw err;
        }
      }

      if (!canManage) {
        setClubJoinRequests([]);
        setClubProjectRequests([]);
        return;
      }

      const pendingJoinRequests = await getClubJoinRequests(club.id, user.userId);
      setClubJoinRequests(pendingJoinRequests);

      const allProjects = await getProjects();
      const pendingRequests = (
        await Promise.all(
          allProjects.map(async (project) => {
            const links = await getProjectClubLinks(project.id, user.userId);
            const pendingLink = links.find((link) => link.clubId === club.id && link.status === "PENDING");
            if (!pendingLink) return null;
            return { project, link: pendingLink };
          })
        )
      ).filter((entry): entry is ClubProjectRequest => !!entry);

      pendingRequests.sort((a, b) => b.link.createdAt.localeCompare(a.link.createdAt));
      setClubProjectRequests(pendingRequests);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setClubDetailLoading(false);
    }
  }

  async function handleReviewJoinRequest(targetUserId: string, status: "APPROVED" | "REJECTED") {
    if (!viewingClub) return;
    try {
      await reviewClubJoinRequest({
        clubId: viewingClub.id,
        userId: targetUserId,
        actorId: user.userId,
        status
      });
      setMessage(status === "APPROVED" ? `Approved @${targetUserId}` : `Rejected @${targetUserId}`);
      await openClubDetail(viewingClub);
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleSetJoinPolicy(joinPolicy: ClubJoinPolicy) {
    if (!viewingClub) return;
    try {
      await updateClub({
        clubId: viewingClub.id,
        viewerId: user.userId,
        joinPolicy
      });
      setMessage(`Join rule updated to ${formatJoinPolicyLabel(joinPolicy)}.`);
      await openClubDetail({ ...viewingClub, joinPolicy });
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleSetClubVisibility(isPublic: boolean) {
    if (!viewingClub) return;
    try {
      await updateClub({
        clubId: viewingClub.id,
        viewerId: user.userId,
        isPublic
      });
      setMessage(`Club visibility set to ${isPublic ? "Public" : "Private"}.`);
      await openClubDetail({ ...viewingClub, isPublic });
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleReviewClubProjectRequest(projectId: string, status: "APPROVED" | "REJECTED") {
    if (!viewingClub) return;
    try {
      await reviewProjectClubLink({
        projectId,
        clubId: viewingClub.id,
        actorId: user.userId,
        status
      });
      setMessage(status === "APPROVED" ? "Project request approved." : "Project request rejected.");
      await openClubDetail(viewingClub);
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handlePostClubHighlight() {
    if (!viewingClub || !clubHighlightText.trim()) {
      setMessage("Club highlight text is required.");
      return;
    }
    try {
      await createPost({
        userId: user.userId,
        text: clubHighlightText.trim(),
        visibility: "CLUB",
        clubId: viewingClub.id,
        postedAsClub: true,
        clubActorId: user.userId,
        tags: ["SHOWCASE"]
      });
      setClubHighlightText("");
      setMessage("Club highlight posted.");
      await openClubDetail(viewingClub);
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function handleSetMemberRole(memberId: string, role: "MEMBER" | "MODERATOR") {
    if (!viewingClub) return;
    try {
      await updateClubMemberRole({
        clubId: viewingClub.id,
        memberId,
        actorId: user.userId,
        role
      });
      setMessage(`Updated @${memberId} role to ${role}.`);
      await openClubDetail(viewingClub);
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function openEditModal(club: Club) {
    setEditingClub(club);
    setEditClubName(club.name);
    setEditClubDescription(club.description ?? "");
    setEditClubIsPublic(club.isPublic !== false);
    setEditClubJoinPolicy(resolveEffectiveJoinPolicy(club));
    setEditModalOpen(true);
  }

  async function handleSaveClubEdit() {
    if (!editingClub) return;
    if (!editClubName.trim()) {
      setMessage("Club name is required.");
      return;
    }

    try {
      await updateClub({
        clubId: editingClub.id,
        viewerId: user.userId,
        name: editClubName.trim(),
        description: editClubDescription.trim(),
        isPublic: editClubIsPublic,
        joinPolicy: editClubJoinPolicy
      });
      setEditModalOpen(false);
      setEditingClub(null);
      setMessage("Club updated.");
      loadData();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  function openCreateEventModal() {
    setNewEventTitle("");
    setNewEventDescription("");
    setNewEventIsAllDay(false);
    setNewEventStartAt(null);
    setNewEventEndAt(null);
    setNewEventLocationText("");
    setNewEventVisibility(viewingClub?.isPublic ? "PUBLIC_CLUB" : "CLUB_MEMBERS");
    setCreateEventModalOpen(true);
  }

  function openDateTimePicker(target: "start" | "end") {
    const baseDate =
      target === "start" ? newEventStartAt ?? new Date() : newEventEndAt ?? newEventStartAt ?? new Date();

    if (Platform.OS === "android") {
      const openAndroidPicker = (reopenCreateEventModal: boolean) => {
        DateTimePickerAndroid.open({
          value: baseDate,
          mode: "date",
          is24Hour: true,
          onChange: (dateEvent, pickedDate) => {
            if (dateEvent.type === "dismissed" || !pickedDate) {
              if (reopenCreateEventModal) setCreateEventModalOpen(true);
              return;
            }

            const withDate = new Date(baseDate);
            withDate.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());

            DateTimePickerAndroid.open({
              value: withDate,
              mode: newEventIsAllDay ? "date" : "time",
              is24Hour: true,
              onChange: (timeEvent, pickedTime) => {
                if (timeEvent.type === "dismissed" || !pickedTime) {
                  if (reopenCreateEventModal) setCreateEventModalOpen(true);
                  return;
                }
                const combined = new Date(withDate);
                if (newEventIsAllDay) {
                  combined.setHours(0, 0, 0, 0);
                } else {
                  combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
                }
                if (target === "start") {
                  setNewEventStartAt(combined);
                } else {
                  setNewEventEndAt(combined);
                }
                if (reopenCreateEventModal) setCreateEventModalOpen(true);
              }
            });
          }
        });
      };

      if (createEventModalOpen) {
        setCreateEventModalOpen(false);
        setTimeout(() => openAndroidPicker(true), 100);
      } else {
        openAndroidPicker(false);
      }

      return;
    }

    setDateTimePickerTarget(target);
    setDateTimePickerMode("date");
    setDateTimePickerDraft(baseDate);
    setDateTimePickerOpen(true);
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

  function formatDateLocalValue(value: Date | null): string {
    if (!value) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateTimeLocalValue(raw: string): Date | null {
    if (!raw) return null;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseDateLocalValue(raw: string): Date | null {
    if (!raw) return null;
    const [yearRaw, monthRaw, dayRaw] = raw.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
    return new Date(year, month - 1, day, 0, 0, 0, 0);
  }

  function handleWebStartDateTimeChange(event: ChangeEvent<HTMLInputElement>) {
    setNewEventStartAt(parseDateTimeLocalValue(event.target.value));
  }

  function handleWebStartDateChange(event: ChangeEvent<HTMLInputElement>) {
    setNewEventStartAt(parseDateLocalValue(event.target.value));
  }

  function handleWebEndDateTimeChange(event: ChangeEvent<HTMLInputElement>) {
    setNewEventEndAt(parseDateTimeLocalValue(event.target.value));
  }

  function handleWebEndDateChange(event: ChangeEvent<HTMLInputElement>) {
    setNewEventEndAt(parseDateLocalValue(event.target.value));
  }

  function handleDateTimePickerChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (event.type === "dismissed") {
      setDateTimePickerOpen(false);
      setDateTimePickerMode("date");
      return;
    }

    if (!selectedDate) return;

    if (Platform.OS === "android") {
      if (dateTimePickerMode === "date") {
        setDateTimePickerDraft(selectedDate);
        setDateTimePickerMode("time");
        return;
      }

      const combined = new Date(dateTimePickerDraft);
      if (newEventIsAllDay) {
        combined.setHours(0, 0, 0, 0);
      } else {
        combined.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      }
      if (dateTimePickerTarget === "start") {
        setNewEventStartAt(combined);
      } else {
        setNewEventEndAt(combined);
      }
      setDateTimePickerOpen(false);
      setDateTimePickerMode("date");
      return;
    }

    const picked = new Date(selectedDate);
    if (newEventIsAllDay) {
      picked.setHours(0, 0, 0, 0);
    }
    if (dateTimePickerTarget === "start") {
      setNewEventStartAt(picked);
    } else {
      setNewEventEndAt(picked);
    }
    setDateTimePickerOpen(false);
    setDateTimePickerMode("date");
  }

  function formatEventInputDate(value: Date | null, placeholder: string): string {
    if (!value) return placeholder;
    return newEventIsAllDay ? value.toLocaleDateString() : value.toLocaleString();
  }

  async function handleCreateEvent() {
    if (!viewingClub) return;

    if (!newEventTitle.trim()) {
      setMessage("Event title is required.");
      return;
    }

    if (!newEventStartAt) {
      setMessage("Start date/time is required.");
      return;
    }
    const normalizedStart = new Date(newEventStartAt);
    if (newEventIsAllDay) {
      normalizedStart.setHours(0, 0, 0, 0);
    }
    const startAtIso = normalizedStart.toISOString();

    let endAtIso: string | undefined;
    if (newEventEndAt) {
      const normalizedEnd = new Date(newEventEndAt);
      if (newEventIsAllDay) {
        normalizedEnd.setHours(0, 0, 0, 0);
      }

      if (normalizedEnd.getTime() < normalizedStart.getTime()) {
        setMessage("End date/time must be after start date/time.");
        return;
      }
      endAtIso = normalizedEnd.toISOString();
    }

    if (newEventVisibility === "PUBLIC_CLUB" && !viewingClub.isPublic) {
      setMessage("Private clubs can only create members-only events.");
      return;
    }

    try {
      await createClubEvent(viewingClub.id, {
        actorId: user.userId,
        title: newEventTitle.trim(),
        description: newEventDescription.trim() || undefined,
        isAllDay: newEventIsAllDay,
        startAt: startAtIso,
        endAt: endAtIso,
        locationText: newEventLocationText.trim() || undefined,
        visibility: newEventVisibility,
        status: "SCHEDULED"
      });

      setCreateEventModalOpen(false);
      setMessage("Event created.");
      await openClubDetail(viewingClub);
      setClubDetailTab("EVENTS");
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  const discoverCategoryFilteredClubs = useMemo(
    () => (discoverCategoryId ? clubs.filter((club) => club.categoryId === discoverCategoryId) : clubs),
    [clubs, discoverCategoryId]
  );
  const discoverCategoryFilteredJoinable = useMemo(
    () => (discoverCategoryId ? joinableClubs.filter((club) => club.categoryId === discoverCategoryId) : joinableClubs),
    [joinableClubs, discoverCategoryId]
  );
  const featuredDiscoverCategories = useMemo(() => categories.slice(0, 4), [categories]);
  const discoverSelectedCategory = useMemo(
    () => categories.find((category) => category.id === discoverCategoryId) ?? null,
    [categories, discoverCategoryId]
  );
  const discoverModalCategories = useMemo(() => {
    const query = discoverCategorySearch.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) => category.name.toLowerCase().includes(query));
  }, [categories, discoverCategorySearch]);

  const isInitialLoad =
    loading &&
    clubs.length === 0 &&
    myClubs.length === 0 &&
    joinableClubs.length === 0 &&
    clubFeed.length === 0 &&
    !viewingClub;

  const associatedCategoryIdsForCreate = useMemo(
    () => Array.from(new Set(myClubs.map((club) => club.categoryId).filter((value): value is string => !!value))),
    [myClubs]
  );

  if (isInitialLoad) return <ActivityIndicator style={{ marginTop: 24 }} />;

  const ownerMembers = clubMembers.filter((member) => member.role === "OWNER");
  const nonOwnerMembers = clubMembers.filter((member) => member.role !== "OWNER");
  const viewerMembership = viewingClub
    ? clubMembers.find((member) => member.clubId === viewingClub.id && member.userId === user.userId)
    : null;
  const canManageClub = viewerMembership?.role === "OWNER" || viewerMembership?.role === "MODERATOR";
  const isOwner = viewerMembership?.role === "OWNER";
  const activeJoinPolicy = viewingClub ? resolveEffectiveJoinPolicy(viewingClub) : "OPEN";
  const sortedClubEvents = [...clubEvents].sort((a, b) => {
    const timeDiff = new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.id.localeCompare(b.id);
  });
  const nowTimestamp = Date.now();
  const upcomingClubEvents = sortedClubEvents.filter((event) => new Date(event.startAt).getTime() >= nowTimestamp);
  const pastClubEvents = sortedClubEvents.filter((event) => new Date(event.startAt).getTime() < nowTimestamp);
  const clubStatsSummary: ClubStatsSummary = {
    membersCount: clubMembers.length,
    pendingJoinRequestsCount: clubJoinRequests.length,
    totalHighlightsCount: detailClubFeed.length
  };

  function toLocalDateKey(rawDate: string): string | null {
    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return null;
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const selectedDayEvents = sortedClubEvents.filter((event) => toLocalDateKey(event.startAt) === selectedCalendarDate);

  const calendarMarkedDates = sortedClubEvents.reduce<Record<string, { marked?: boolean; selected?: boolean; selectedColor?: string }>>(
    (acc, event) => {
      const dayKey = toLocalDateKey(event.startAt);
      if (!dayKey) return acc;
      acc[dayKey] = {
        ...(acc[dayKey] ?? {}),
        marked: true
      };
      return acc;
    },
    {
      [selectedCalendarDate]: {
        selected: true,
        selectedColor: "#111"
      }
    }
  );

  if (calendarMarkedDates[selectedCalendarDate]) {
    calendarMarkedDates[selectedCalendarDate] = {
      ...calendarMarkedDates[selectedCalendarDate],
      selected: true,
      selectedColor: "#111"
    };
  }

  function formatEventDateRange(event: ClubEvent): string {
    const start = new Date(event.startAt);
    const end = event.endAt ? new Date(event.endAt) : null;
    if (Number.isNaN(start.getTime())) return event.startAt;

    if (event.isAllDay) {
      const startText = start.toLocaleDateString();
      if (!end || Number.isNaN(end.getTime())) return `${startText} • All day`;
      return `${startText} → ${end.toLocaleDateString()} • All day`;
    }

    const startText = start.toLocaleString();
    if (!end || Number.isNaN(end.getTime())) return startText;
    return `${startText} → ${end.toLocaleString()}`;
  }

  function getHistoryProjectTitle(event: ClubHistoryEvent): string {
    const metadataProjectTitle = event.metadata?.projectTitle;
    if (typeof metadataProjectTitle === "string" && metadataProjectTitle.trim()) {
      return metadataProjectTitle.trim();
    }

    if (event.subjectProjectId) {
      const project = clubProjects.find((item) => item.id === event.subjectProjectId);
      if (project?.title) return project.title;
      return event.subjectProjectId;
    }

    return "project";
  }

  function formatHistorySummary(event: ClubHistoryEvent): string {
    const actor = event.actorId ? `@${event.actorId}` : "Someone";
    const subjectUser = event.subjectUserId ? `@${event.subjectUserId}` : "a member";
    const projectTitle = getHistoryProjectTitle(event);

    switch (event.eventType) {
      case "CLUB_CREATED":
        return "Club created";
      case "FOUNDER_RECORDED":
        return "Founder recorded";
      case "CLUB_EVENT_CREATED": {
        const title = typeof event.metadata?.title === "string" ? event.metadata.title : "event";
        return `${actor} created event '${title}'`;
      }
      case "CLUB_EVENT_UPDATED": {
        const title = typeof event.metadata?.title === "string" ? event.metadata.title : "event";
        return `${actor} updated event '${title}'`;
      }
      case "CLUB_EVENT_CANCELED": {
        const title = typeof event.metadata?.title === "string" ? event.metadata.title : "event";
        return `${actor} canceled event '${title}'`;
      }
      case "OWNERSHIP_TRANSFERRED":
        return `${actor} transferred ownership to ${subjectUser}`;
      case "MODERATOR_ADDED":
        return `${actor} promoted ${subjectUser} to moderator`;
      case "MODERATOR_REMOVED":
        return `${actor} removed ${subjectUser} as moderator`;
      case "MEMBER_ROLE_CHANGED":
        return `${actor} changed ${subjectUser}'s role`;
      case "MEMBER_REMOVED":
        return `${actor} removed ${subjectUser} from the club`;
      case "PROJECT_LINK_REQUESTED":
        return `${actor} requested to link project '${projectTitle}'`;
      case "PROJECT_CREATED_FOR_CLUB":
        return `${actor} created club project '${projectTitle}'`;
      case "PROJECT_LINK_APPROVED":
        return `${actor} approved project '${projectTitle}'`;
      case "PROJECT_LINK_REJECTED":
        return `${actor} rejected project '${projectTitle}'`;
      case "PROJECT_LINK_REMOVED":
        return `${actor} removed project '${projectTitle}'`;
      case "CLUB_SETTINGS_UPDATED":
        return `${actor} updated club settings`;
      default:
        return "Governance activity updated";
    }
  }

  function getHistoryIcon(eventType: ClubHistoryEvent["eventType"]): string {
    if (eventType.includes("OWNERSHIP")) return "👑";
    if (eventType.includes("CLUB_EVENT")) return "📅";
    if (eventType.includes("MODERATOR") || eventType.includes("MEMBER")) return "👥";
    if (eventType.includes("PROJECT")) return "🧩";
    return "🕘";
  }

  if (viewingClub) {
    const isPendingJoinRequest = clubJoinRequestStatus?.status === "PENDING";
    const isApprovedJoinRequest = clubJoinRequestStatus?.status === "APPROVED";
    const isRejectedJoinRequest = clubJoinRequestStatus?.status === "REJECTED";
    const isClubMember = !!viewerMembership || isApprovedJoinRequest;

    return (
      <FlatList
        data={[]}
        keyExtractor={(_, index) => `club-detail-${index}`}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Pressable
              onPress={() => {
                setViewingClub(null);
                onBackToClubsRoot?.();
              }}
              style={styles.buttonInline}
            >
              <Text style={styles.buttonText}>← Back to Clubs</Text>
            </Pressable>

            <Animated.View
              style={[
                styles.card,
                highlightedClubId === viewingClub.id ? styles.focusedTargetCard : null,
                highlightedClubId === viewingClub.id ? clubEmphasisAnimatedStyle : null
              ]}
            >
              <View style={styles.clubHeaderRow}>
                <View style={styles.clubHeaderMain}>
                  <Text style={styles.sectionTitle}>{viewingClub.name}</Text>
                  <View style={styles.visibilityRow}>
                    <Text style={styles.hint}>Visibility:</Text>
                    <View style={styles.visibilityBadge}>
                      <Text style={styles.visibilityBadgeText}>{formatClubVisibilityLabel(viewingClub.isPublic)}</Text>
                    </View>
                  </View>
                  <View style={styles.visibilityRow}>
                    <Text style={styles.hint}>Join Rule:</Text>
                    <View style={styles.visibilityBadge}>
                      <Text style={styles.visibilityBadgeText}>{formatJoinPolicyLabel(activeJoinPolicy)}</Text>
                    </View>
                  </View>
                  <Text style={styles.hint}>Founder: @{viewingClub.ownerId ?? "unknown"}</Text>
                  <Text style={styles.hint}>{viewingClub.description || "No club description yet."}</Text>
                </View>

                {!canManageClub ? (
                  <View style={styles.joinCtaBox}>
                    {isClubMember ? (
                      <>
                        <Text style={styles.joinCtaTitle}>Membership</Text>
                        <View style={styles.visibilityBadge}>
                          <Text style={styles.visibilityBadgeText}>Club Member</Text>
                        </View>
                        <Text style={styles.joinCtaStatus}>You have access to member-only club spaces.</Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.joinCtaTitle}>Membership</Text>
                        <Text style={styles.joinCtaHint}>Choose how to join this club.</Text>
                        {activeJoinPolicy === "OPEN" ? (
                          <Pressable onPress={() => handleJoinClub(viewingClub)} style={styles.buttonInline}>
                            <Text style={styles.buttonText}>Join Club</Text>
                          </Pressable>
                        ) : null}
                        {activeJoinPolicy === "REQUEST_REQUIRED" ? (
                          <Pressable
                            onPress={() => handleJoinClub(viewingClub)}
                            style={[styles.buttonInline, isPendingJoinRequest ? styles.buttonInlineDisabled : null]}
                            disabled={isPendingJoinRequest}
                          >
                            <Text style={styles.buttonText}>{isPendingJoinRequest ? "Request Sent 🤞" : "Join Club"}</Text>
                          </Pressable>
                        ) : null}
                        {activeJoinPolicy === "INVITE_ONLY" ? (
                          <View style={styles.visibilityBadge}>
                            <Text style={styles.visibilityBadgeText}>Invite Only</Text>
                          </View>
                        ) : null}
                        {isPendingJoinRequest ? <Text style={styles.joinCtaStatus}>Your join request is pending moderator review.</Text> : null}
                        {isRejectedJoinRequest ? <Text style={styles.joinCtaStatus}>Your last request was rejected.</Text> : null}
                      </>
                    )}
                  </View>
                ) : null}
              </View>
            </Animated.View>

            {canManageClub ? (
              <Pressable onPress={() => setAdminPanelOpen(true)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Open Admin Panel</Text>
              </Pressable>
            ) : null}

            {message ? <Text style={styles.message}>{message}</Text> : null}

            <View style={styles.rowWrap}>
              <Pressable
                onPress={() => setClubDetailTab("HIGHLIGHTS")}
                style={[styles.pill, clubDetailTab === "HIGHLIGHTS" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "HIGHLIGHTS" && styles.pillTextActive]}>Highlights</Text>
              </Pressable>
              <Pressable
                onPress={() => setClubDetailTab("MEMBERS")}
                style={[styles.pill, clubDetailTab === "MEMBERS" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "MEMBERS" && styles.pillTextActive]}>Members</Text>
              </Pressable>
              <Pressable
                onPress={() => setClubDetailTab("PROJECTS")}
                style={[styles.pill, clubDetailTab === "PROJECTS" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "PROJECTS" && styles.pillTextActive]}>Projects</Text>
              </Pressable>
              {canManageClub ? (
                <Pressable
                  onPress={() => setClubDetailTab("PROJECT_REQUESTS")}
                  style={[styles.pill, clubDetailTab === "PROJECT_REQUESTS" && styles.pillActive]}
                >
                  <Text style={[styles.pillText, clubDetailTab === "PROJECT_REQUESTS" && styles.pillTextActive]}>
                    Project Requests
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setClubDetailTab("HISTORY")}
                style={[styles.pill, clubDetailTab === "HISTORY" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "HISTORY" && styles.pillTextActive]}>History</Text>
              </Pressable>
              <Pressable
                onPress={() => setClubDetailTab("EVENTS")}
                style={[styles.pill, clubDetailTab === "EVENTS" && styles.pillActive]}
              >
                <Text style={[styles.pillText, clubDetailTab === "EVENTS" && styles.pillTextActive]}>Events</Text>
              </Pressable>
            </View>

            {clubDetailLoading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}

            {clubDetailTab === "HIGHLIGHTS" ? (
              <>
                <Text style={styles.sectionTitle}>Club Highlights</Text>
                {canManageClub ? (
                  <View style={styles.card}>
                    <Text style={styles.filterLabel}>Post highlight as club</Text>
                    <TextInput
                      value={clubHighlightText}
                      onChangeText={setClubHighlightText}
                      placeholder="Share a club highlight"
                      style={styles.input}
                    />
                    <Pressable onPress={handlePostClubHighlight} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Post as @{viewingClub.name}</Text>
                    </Pressable>
                  </View>
                ) : null}
                {detailClubFeed.length === 0 ? <Text style={styles.hint}>No club posts yet.</Text> : null}
                <FlatList
                  ref={clubHighlightsListRef}
                  data={detailClubFeed}
                  keyExtractor={(post) => `club-feed-${post.postId}`}
                  style={styles.clubHighlightsList}
                  nestedScrollEnabled
                  onScrollToIndexFailed={() => {
                    clubHighlightsListRef.current?.scrollToOffset({ offset: 0, animated: true });
                  }}
                  renderItem={({ item: post }) => {
                    const focused = highlightedClubPostId === post.postId;
                    return (
                      <Animated.View style={[styles.card, focused ? styles.focusedTargetItem : null, focused ? clubPostEmphasisAnimatedStyle : null, focused ? clubPostGlowAnimatedStyle : null]}>
                        <Text style={styles.clubName}>
                          {post.postedAsClub ? `@${viewingClub.name} by ${post.clubActorId ?? post.userId}` : `@${post.userId}`}
                        </Text>
                        <Text>{post.text}</Text>
                      </Animated.View>
                    );
                  }}
                />
              </>
            ) : null}

            {clubDetailTab === "MEMBERS" ? (
              <>
                <Text style={styles.sectionTitle}>Club Members</Text>
                <Text style={styles.filterLabel}>Owner</Text>
                {ownerMembers.map((member) => (
                  <View key={`${member.clubId}-${member.userId}`} style={styles.card}>
                    <Text style={styles.clubName}>@{member.userId}</Text>
                    <Text style={styles.hint}>{member.role}</Text>
                  </View>
                ))}

                <Text style={styles.filterLabel}>Members</Text>
                {nonOwnerMembers.length === 0 ? <Text style={styles.hint}>No members found yet.</Text> : null}
                {nonOwnerMembers.map((member) => (
                  <View key={`${member.clubId}-${member.userId}`} style={styles.card}>
                    <Text style={styles.clubName}>@{member.userId}</Text>
                    <Text style={styles.hint}>{member.role}</Text>
                    {isOwner ? (
                      <View style={styles.rowWrap}>
                        <Pressable
                          onPress={() => handleSetMemberRole(member.userId, "MODERATOR")}
                          style={[styles.pill, member.role === "MODERATOR" && styles.pillActive]}
                        >
                          <Text style={[styles.pillText, member.role === "MODERATOR" && styles.pillTextActive]}>Admin</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleSetMemberRole(member.userId, "MEMBER")}
                          style={[styles.pill, member.role === "MEMBER" && styles.pillActive]}
                        >
                          <Text style={[styles.pillText, member.role === "MEMBER" && styles.pillTextActive]}>Member</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}

            {clubDetailTab === "PROJECTS" ? (
              <>
                <Text style={styles.sectionTitle}>Projects</Text>
                {clubProjects.length === 0 ? <Text style={styles.hint}>No approved projects linked to this club yet.</Text> : null}
                {clubProjects.map((item) => (
                  <Pressable key={`club-project-${item.id}`} style={styles.card} onPress={() => onNavigateToProject?.(item.id)}>
                    <Text style={styles.clubName}>{item.title}</Text>
                    <Text style={styles.openHint}>Tap to open project</Text>
                    <View style={styles.visibilityRow}>
                      <Text style={styles.hint}>Visibility:</Text>
                      <View style={styles.visibilityBadge}>
                        <Text style={styles.visibilityBadgeText}>{formatProjectVisibilityLabel(item.visibility)}</Text>
                      </View>
                    </View>
                    <Text style={styles.hint}>{item.description || "No description"}</Text>
                    <Text style={styles.hint}>Owner: @{item.ownerId}</Text>
                    {item.createdBy ? <Text style={styles.hint}>Created by: @{item.createdBy}</Text> : null}
                  </Pressable>
                ))}
              </>
            ) : null}

            {clubDetailTab === "PROJECT_REQUESTS" ? (
              <>
                <Text style={styles.sectionTitle}>Project Requests</Text>
                {canManageClub && clubProjectRequests.length === 0 ? <Text style={styles.hint}>No pending project requests.</Text> : null}
                {canManageClub
                  ? clubProjectRequests.map((request) => (
                      <View key={`club-request-${request.project.id}`} style={styles.card}>
                        <Text style={styles.clubName}>{request.project.title}</Text>
                        <View style={styles.visibilityRow}>
                          <Text style={styles.hint}>Visibility:</Text>
                          <View style={styles.visibilityBadge}>
                            <Text style={styles.visibilityBadgeText}>{formatProjectVisibilityLabel(request.project.visibility)}</Text>
                          </View>
                        </View>
                        <Pressable onPress={() => onNavigateToProject?.(request.project.id)}>
                          <Text style={styles.openHint}>Open project</Text>
                        </Pressable>
                        <Text style={styles.hint}>Owner: @{request.project.ownerId}</Text>
                        {request.project.description ? <Text style={styles.hint}>{request.project.description}</Text> : null}
                        <Text style={styles.hint}>Requested: {new Date(request.link.createdAt).toLocaleString()}</Text>
                        <View style={styles.rowWrap}>
                          <Pressable
                            onPress={() => handleReviewClubProjectRequest(request.project.id, "APPROVED")}
                            style={styles.buttonInline}
                          >
                            <Text style={styles.buttonText}>Approve</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleReviewClubProjectRequest(request.project.id, "REJECTED")}
                            style={styles.buttonInline}
                          >
                            <Text style={styles.buttonText}>Reject</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  : <Text style={styles.hint}>Only club owner/admin can review requests.</Text>}
              </>
            ) : null}

            {clubDetailTab === "HISTORY" ? (
              <>
                <Text style={styles.sectionTitle}>History</Text>
                {clubHistoryEvents.length === 0 ? <Text style={styles.hint}>No governance activity yet.</Text> : null}
                {clubHistoryEvents.map((event, index) => (
                  <View
                    key={`club-history-${event.id}`}
                    style={[styles.historyRow, index === clubHistoryEvents.length - 1 && styles.historyRowLast]}
                  >
                    <Text style={styles.historyIcon}>{getHistoryIcon(event.eventType)}</Text>
                    <View style={styles.historyBody}>
                      <Text style={styles.historySummary}>{formatHistorySummary(event)}</Text>
                      <Text style={styles.historyTimestamp}>{new Date(event.createdAt).toLocaleString()}</Text>
                    </View>
                  </View>
                ))}
              </>
            ) : null}

            {clubDetailTab === "EVENTS" ? (
              <>
                <Text style={styles.sectionTitle}>Events</Text>
                <View style={styles.rowWrap}>
                  <Pressable
                    onPress={() => setEventsViewMode("LIST")}
                    style={[styles.pill, eventsViewMode === "LIST" && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, eventsViewMode === "LIST" && styles.pillTextActive]}>List</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setEventsViewMode("CALENDAR")}
                    style={[styles.pill, eventsViewMode === "CALENDAR" && styles.pillActive]}
                  >
                    <Text style={[styles.pillText, eventsViewMode === "CALENDAR" && styles.pillTextActive]}>Calendar</Text>
                  </Pressable>
                </View>
                {canManageClub ? (
                  <View style={styles.card}>
                    <Text style={styles.hint}>You can manage club events.</Text>
                    <Pressable onPress={openCreateEventModal} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Create Event</Text>
                    </Pressable>
                  </View>
                ) : null}

                {eventsViewMode === "LIST" ? (
                  <>
                    {upcomingClubEvents.length === 0 ? <Text style={styles.hint}>No upcoming events yet.</Text> : null}
                    {upcomingClubEvents.map((event) => (
                      <View key={`club-event-upcoming-${event.id}`} style={styles.card}>
                        <Text style={styles.clubName}>{event.title}</Text>
                        <Text style={styles.hint}>{formatEventDateRange(event)}</Text>
                        {event.locationText ? <Text style={styles.hint}>📍 {event.locationText}</Text> : null}
                        <Text style={styles.hint}>Status: {event.status}</Text>
                      </View>
                    ))}

                    {pastClubEvents.length > 0 ? <Text style={styles.filterLabel}>Past events</Text> : null}
                    {pastClubEvents.map((event) => (
                      <View key={`club-event-past-${event.id}`} style={styles.card}>
                        <Text style={styles.clubName}>{event.title}</Text>
                        <Text style={styles.hint}>{formatEventDateRange(event)}</Text>
                        {event.locationText ? <Text style={styles.hint}>📍 {event.locationText}</Text> : null}
                        <Text style={styles.hint}>Status: {event.status}</Text>
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    <View style={styles.card}>
                      <Calendar
                        onDayPress={(day: DateData) => setSelectedCalendarDate(day.dateString)}
                        markedDates={calendarMarkedDates}
                      />
                    </View>
                    <Text style={styles.filterLabel}>Events on {selectedCalendarDate}</Text>
                    {selectedDayEvents.length === 0 ? (
                      <Text style={styles.hint}>No events scheduled for this day.</Text>
                    ) : null}
                    {selectedDayEvents.map((event) => (
                      <View key={`club-event-day-${event.id}`} style={styles.card}>
                        <Text style={styles.clubName}>{event.title}</Text>
                        <Text style={styles.hint}>{formatEventDateRange(event)}</Text>
                        {event.locationText ? <Text style={styles.hint}>📍 {event.locationText}</Text> : null}
                        <Text style={styles.hint}>Status: {event.status}</Text>
                      </View>
                    ))}
                  </>
                )}
              </>
            ) : null}

            <Modal
              visible={createEventModalOpen}
              transparent
              animationType="fade"
              onRequestClose={() => setCreateEventModalOpen(false)}
            >
              <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                  <Text style={styles.sectionTitle}>Create Event</Text>
                  <ScrollView
                    style={styles.modalScroll}
                    contentContainerStyle={styles.modalScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator
                  >
                    <TextInput
                      value={newEventTitle}
                      onChangeText={setNewEventTitle}
                      placeholder="Title"
                      style={styles.input}
                    />
                    <TextInput
                      value={newEventDescription}
                      onChangeText={setNewEventDescription}
                      placeholder="Description (optional)"
                      style={styles.input}
                    />
                    <TextInput
                      value={newEventLocationText}
                      onChangeText={setNewEventLocationText}
                      placeholder="Location (optional)"
                      style={styles.input}
                    />

                    <Text style={styles.filterLabel}>Type</Text>
                    <View style={styles.rowWrap}>
                      <Pressable
                        onPress={() => setNewEventIsAllDay(false)}
                        style={[styles.pill, !newEventIsAllDay && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, !newEventIsAllDay && styles.pillTextActive]}>Timed</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setNewEventIsAllDay(true)}
                        style={[styles.pill, newEventIsAllDay && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, newEventIsAllDay && styles.pillTextActive]}>All-day</Text>
                      </Pressable>
                    </View>

                    <Text style={styles.filterLabel}>Start</Text>
                    {Platform.OS === "web" ? (
                      newEventIsAllDay ? (
                        <input
                          type="date"
                          value={formatDateLocalValue(newEventStartAt)}
                          onChange={handleWebStartDateChange}
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
                        <input
                          type="datetime-local"
                          value={formatDateTimeLocalValue(newEventStartAt)}
                          onChange={handleWebStartDateTimeChange}
                          style={{
                            border: "1px solid #ccc",
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 8,
                            width: "100%",
                            boxSizing: "border-box"
                          }}
                        />
                      )
                    ) : (
                      <Pressable onPress={() => openDateTimePicker("start")} style={styles.input}>
                        <Text>{formatEventInputDate(newEventStartAt, newEventIsAllDay ? "Select start date" : "Select start date/time")}</Text>
                      </Pressable>
                    )}

                    <Text style={styles.filterLabel}>End (optional)</Text>
                    {Platform.OS === "web" ? (
                      newEventIsAllDay ? (
                        <input
                          type="date"
                          value={formatDateLocalValue(newEventEndAt)}
                          onChange={handleWebEndDateChange}
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
                        <input
                          type="datetime-local"
                          value={formatDateTimeLocalValue(newEventEndAt)}
                          onChange={handleWebEndDateTimeChange}
                          style={{
                            border: "1px solid #ccc",
                            borderRadius: 8,
                            padding: 10,
                            marginBottom: 8,
                            width: "100%",
                            boxSizing: "border-box"
                          }}
                        />
                      )
                    ) : (
                      <Pressable onPress={() => openDateTimePicker("end")} style={styles.input}>
                        <Text>{formatEventInputDate(newEventEndAt, newEventIsAllDay ? "Select end date" : "Select end date/time")}</Text>
                      </Pressable>
                    )}
                    {newEventEndAt ? (
                      <Pressable onPress={() => setNewEventEndAt(null)} style={styles.buttonInline}>
                        <Text style={styles.buttonText}>Clear End Time</Text>
                      </Pressable>
                    ) : null}

                    <Text style={styles.filterLabel}>Visibility</Text>
                    <View style={styles.rowWrap}>
                      <Pressable
                        onPress={() => setNewEventVisibility("CLUB_MEMBERS")}
                        style={[styles.pill, newEventVisibility === "CLUB_MEMBERS" && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, newEventVisibility === "CLUB_MEMBERS" && styles.pillTextActive]}>
                          Club Members
                        </Text>
                      </Pressable>
                      {viewingClub.isPublic ? (
                        <Pressable
                          onPress={() => setNewEventVisibility("PUBLIC_CLUB")}
                          style={[styles.pill, newEventVisibility === "PUBLIC_CLUB" && styles.pillActive]}
                        >
                          <Text style={[styles.pillText, newEventVisibility === "PUBLIC_CLUB" && styles.pillTextActive]}>
                            Public Club
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </ScrollView>

                  <View style={styles.rowWrap}>
                    <Pressable onPress={handleCreateEvent} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Create Event</Text>
                    </Pressable>
                    <Pressable onPress={() => setCreateEventModalOpen(false)} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Cancel</Text>
                    </Pressable>
                  </View>

                  {Platform.OS === "ios" && dateTimePickerOpen ? (
                    <DateTimePicker
                      value={dateTimePickerDraft}
                      mode={dateTimePickerMode}
                      is24Hour
                      onChange={handleDateTimePickerChange}
                    />
                  ) : null}
                </View>
              </View>
            </Modal>

            <Modal visible={adminPanelOpen} transparent animationType="fade" onRequestClose={() => setAdminPanelOpen(false)}>
              <View style={styles.modalBackdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setAdminPanelOpen(false)} />
                <View style={styles.modalCard}>
                  <Text style={styles.sectionTitle}>Club Admin Panel</Text>
                  <Text style={styles.hint}>Owner/admin tools for membership, requests, and club settings.</Text>

                  <View style={styles.adminHeroCard}>
                    <Text style={styles.adminHeroTitle}>{viewingClub.name}</Text>
                    <Text style={styles.adminHeroSubtitle}>Manage club access, review requests, and keep tabs on activity.</Text>
                    <View style={styles.adminStatsGrid}>
                      <View style={styles.adminStatCard}>
                        <Text style={styles.adminStatValue}>{clubStatsSummary.membersCount}</Text>
                        <Text style={styles.adminStatLabel}>Members</Text>
                      </View>
                      <View style={styles.adminStatCard}>
                        <Text style={styles.adminStatValue}>{clubStatsSummary.pendingJoinRequestsCount}</Text>
                        <Text style={styles.adminStatLabel}>Pending Requests</Text>
                      </View>
                      <View style={styles.adminStatCard}>
                        <Text style={styles.adminStatValue}>{clubStatsSummary.totalHighlightsCount}</Text>
                        <Text style={styles.adminStatLabel}>Posts / Highlights</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.adminSectionCard}>
                    <Text style={styles.filterLabel}>Club Visibility</Text>
                    <Text style={styles.hint}>Control whether the club appears as public or private.</Text>
                    <View style={styles.rowWrap}>
                      <Pressable
                        onPress={() => handleSetClubVisibility(true)}
                        style={[styles.pill, viewingClub.isPublic !== false && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, viewingClub.isPublic !== false && styles.pillTextActive]}>Public</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleSetClubVisibility(false)}
                        style={[styles.pill, viewingClub.isPublic === false && styles.pillActive]}
                      >
                        <Text style={[styles.pillText, viewingClub.isPublic === false && styles.pillTextActive]}>Private</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.adminSectionCard}>
                    <Text style={styles.filterLabel}>Join Rules</Text>
                    <Text style={styles.hint}>Choose whether members can join instantly or require moderator approval.</Text>
                    <View style={styles.rowWrap}>
                      {(["OPEN", "REQUEST_REQUIRED", "INVITE_ONLY"] as ClubJoinPolicy[]).map((policy) => {
                        const active = activeJoinPolicy === policy;
                        return (
                          <Pressable key={`admin-join-rule-${policy}`} onPress={() => handleSetJoinPolicy(policy)} style={[styles.pill, active && styles.pillActive]}>
                            <Text style={[styles.pillText, active && styles.pillTextActive]}>{formatJoinPolicyLabel(policy)}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.adminSectionCard}>
                    <Text style={styles.filterLabel}>Join Requests</Text>
                    <Text style={styles.hint}>Approve or reject people waiting to join this club.</Text>
                    <ScrollView style={{ maxHeight: 220 }}>
                      {clubJoinRequests.length === 0 ? <Text style={styles.hint}>No pending join requests.</Text> : null}
                      {clubJoinRequests.map((request) => (
                        <View key={`admin-join-request-${request.clubId}-${request.userId}`} style={styles.adminRequestCard}>
                          <View style={styles.adminRequestHeader}>
                            <Text style={styles.clubName}>@{request.userId}</Text>
                            <View style={styles.visibilityBadge}>
                              <Text style={styles.visibilityBadgeText}>Pending</Text>
                            </View>
                          </View>
                          <Text style={styles.hint}>Requested: {new Date(request.createdAt).toLocaleString()}</Text>
                          <View style={styles.rowWrap}>
                            <Pressable onPress={() => handleReviewJoinRequest(request.userId, "APPROVED")} style={styles.buttonInlineStrong}>
                              <Text style={styles.buttonTextInverse}>Approve</Text>
                            </Pressable>
                            <Pressable onPress={() => handleReviewJoinRequest(request.userId, "REJECTED")} style={styles.buttonInline}>
                              <Text style={styles.buttonText}>Reject</Text>
                            </Pressable>
                          </View>
                        </View>
                      ))}
                    </ScrollView>
                  </View>

                  <View style={styles.adminSectionCard}>
                    <Text style={styles.filterLabel}>Quick Actions</Text>
                    <Pressable
                      onPress={() => {
                        setAdminPanelOpen(false);
                        setClubDetailTab("PROJECT_REQUESTS");
                      }}
                      style={styles.buttonInline}
                    >
                      <Text style={styles.buttonText}>Open Project Requests</Text>
                    </Pressable>
                  </View>

                  <View style={styles.rowWrap}>
                    <Pressable onPress={() => setAdminPanelOpen(false)} style={styles.buttonInline}>
                      <Text style={styles.buttonText}>Close Admin Panel</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </Modal>
          </View>
        }
        renderItem={() => null}
      />
    );
  }

  return (
    <>
      <View style={styles.list}>
        <Text style={styles.sectionTitle}>Clubs</Text>
        <Text style={styles.hint}>View your clubs, discover clubs to join, and browse club activity.</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <View style={styles.rowWrap}>
          <Pressable onPress={() => setClubsPageTab("MY_CLUBS")} style={[styles.pill, clubsPageTab === "MY_CLUBS" && styles.pillActive]}>
            <Text style={[styles.pillText, clubsPageTab === "MY_CLUBS" && styles.pillTextActive]}>My Clubs</Text>
          </Pressable>
          <Pressable onPress={() => setClubsPageTab("DISCOVER")} style={[styles.pill, clubsPageTab === "DISCOVER" && styles.pillActive]}>
            <Text style={[styles.pillText, clubsPageTab === "DISCOVER" && styles.pillTextActive]}>Discover</Text>
          </Pressable>
          <Pressable onPress={() => setClubsPageTab("CLUB_FEED")} style={[styles.pill, clubsPageTab === "CLUB_FEED" && styles.pillActive]}>
            <Text style={[styles.pillText, clubsPageTab === "CLUB_FEED" && styles.pillTextActive]}>Club Feed</Text>
          </Pressable>
        </View>
      </View>

      {clubsPageTab === "MY_CLUBS" ? (
        <FlatList
          data={myClubs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadData}
          ListHeaderComponent={
            <View>
              <Pressable onPress={() => setCreateModalOpen(true)} style={styles.button}>
                <Text style={styles.buttonText}>Create a Club</Text>
              </Pressable>
              <Text style={styles.hint}>Clubs you are currently part of.</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.hint}>You are not in any clubs yet.</Text>}
          renderItem={({ item }) => {
            const isOwnerClub = item.ownerId === user.userId;
            return (
              <View style={[styles.card, styles.interactiveCard]}>
                <Pressable
                  onPress={() => openClubDetail(item)}
                  style={({ pressed }) => [styles.cardOpenArea, pressed && styles.interactiveCardPressed]}
                >
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.clubName}>{item.name}</Text>
                    <Text style={styles.openHint}>Open ›</Text>
                  </View>
                  <View style={styles.visibilityRow}>
                    <Text style={styles.hint}>Visibility:</Text>
                    <View style={styles.visibilityBadge}>
                      <Text style={styles.visibilityBadgeText}>{formatClubVisibilityLabel(item.isPublic)}</Text>
                    </View>
                  </View>
                  <Text style={styles.hint}>{item.description || "No description yet"}</Text>
                  {clubAdminStatsByClubId[item.id]?.canManage ? (
                    <View style={styles.rowWrap}>
                      <View style={styles.visibilityBadge}>
                        <Text style={styles.visibilityBadgeText}>Members: {clubAdminStatsByClubId[item.id].membersCount}</Text>
                      </View>
                      <View style={styles.visibilityBadge}>
                        <Text style={styles.visibilityBadgeText}>
                          Join Requests: {clubAdminStatsByClubId[item.id].pendingJoinRequestsCount}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  <Text style={styles.tapHint}>Tap card to open club</Text>
                </Pressable>
                {isOwnerClub ? (
                  <View style={styles.rowWrap}>
                    <Pressable onPress={() => openEditModal(item)} style={styles.pill}>
                      <Text style={styles.pillText}>Modify Info</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          }}
        />
      ) : null}

      {clubsPageTab === "DISCOVER" ? (
        <FlatList
          data={discoverCategoryFilteredJoinable}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadData}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionTitle}>Discover Clubs</Text>
              <TextInput
                value={clubSearch}
                onChangeText={setClubSearch}
                placeholder="Search clubs or categories"
                style={styles.input}
              />
              <Text style={styles.filterLabel}>Category</Text>
              <View style={styles.rowWrap}>
                <Pressable onPress={() => setDiscoverCategoryId("")} style={[styles.pill, discoverCategoryId === "" && styles.pillActive]}>
                  <Text style={[styles.pillText, discoverCategoryId === "" && styles.pillTextActive]}>All</Text>
                </Pressable>
                {featuredDiscoverCategories.map((category) => {
                  const active = discoverCategoryId === category.id;
                  return (
                    <Pressable
                      key={`discover-category-${category.id}`}
                      onPress={() => setDiscoverCategoryId(category.id)}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{category.name}</Text>
                    </Pressable>
                  );
                })}
                {discoverSelectedCategory && !featuredDiscoverCategories.some((category) => category.id === discoverSelectedCategory.id) ? (
                  <Pressable
                    onPress={() => setDiscoverCategoryPickerOpen(true)}
                    style={[styles.pill, styles.pillActive]}
                  >
                    <Text style={[styles.pillText, styles.pillTextActive]}>{discoverSelectedCategory.name}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setDiscoverCategorySearch("");
                    setDiscoverCategoryPickerOpen(true);
                  }}
                  style={styles.pill}
                >
                  <Text style={styles.pillText}>Filter</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Matching Clubs</Text>
              {discoverCategoryFilteredClubs.slice(0, 8).map((club) => (
                <Pressable
                  key={`discover-preview-${club.id}`}
                  style={[styles.card, styles.interactiveCard]}
                  onPress={() => {
                    void openClubDetail(club);
                  }}
                >
                  <View style={styles.cardOpenArea}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.clubName}>{club.name}</Text>
                      <Text style={styles.openHint}>Open ›</Text>
                    </View>
                    <View style={styles.visibilityRow}>
                      <Text style={styles.hint}>Visibility:</Text>
                      <View style={styles.visibilityBadge}>
                        <Text style={styles.visibilityBadgeText}>{formatClubVisibilityLabel(club.isPublic)}</Text>
                      </View>
                    </View>
                    <Text style={styles.hint}>{club.description || "No description"}</Text>
                    <Text style={styles.tapHint}>Tap card to open club</Text>
                  </View>
                </Pressable>
              ))}

              <Text style={styles.sectionTitle}>Available to Join</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.hint}>No clubs available to join for this filter.</Text>}
          renderItem={({ item }) => (
            <View style={[styles.card, styles.interactiveCard]}>
              <Pressable
                onPress={() => {
                  void openClubDetail(item);
                }}
                style={({ pressed }) => [styles.cardOpenArea, pressed && styles.interactiveCardPressed]}
              >
                <View style={styles.cardTitleRow}>
                  <Text style={styles.clubName}>{item.name}</Text>
                  <Text style={styles.openHint}>Open ›</Text>
                </View>
                <View style={styles.visibilityRow}>
                  <Text style={styles.hint}>Visibility:</Text>
                  <View style={styles.visibilityBadge}>
                    <Text style={styles.visibilityBadgeText}>{formatClubVisibilityLabel(item.isPublic)}</Text>
                  </View>
                </View>
                <Text style={styles.hint}>{item.description || "User-created club"}</Text>
                <Text style={styles.tapHint}>Tap card to open club</Text>
              </Pressable>
              {resolveEffectiveJoinPolicy(item) === "INVITE_ONLY" ? (
                <View style={styles.visibilityBadge}>
                  <Text style={styles.visibilityBadgeText}>Invite Only</Text>
                </View>
              ) : (
                <Pressable
                  onPress={() => handleJoinClub(item)}
                  style={[styles.button, resolveEffectiveJoinPolicy(item) === "REQUEST_REQUIRED" && pendingJoinRequestClubIds.includes(item.id) ? styles.buttonDisabled : null]}
                  disabled={resolveEffectiveJoinPolicy(item) === "REQUEST_REQUIRED" && pendingJoinRequestClubIds.includes(item.id)}
                >
                  <Text style={styles.buttonText}>
                    {resolveEffectiveJoinPolicy(item) === "REQUEST_REQUIRED"
                      ? pendingJoinRequestClubIds.includes(item.id)
                        ? "Request Sent 🤞"
                        : "Join Club"
                      : "Join Club"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        />
      ) : null}

      {clubsPageTab === "CLUB_FEED" ? (
        <FlatList
          data={clubFeed}
          keyExtractor={(item) => item.postId}
          contentContainerStyle={styles.list}
          refreshing={loading}
          onRefresh={loadData}
          ListHeaderComponent={
            <View>
              <Text style={styles.sectionTitle}>Club Feed</Text>
              <Text style={styles.hint}>Recent club-related posts and activity.</Text>
              <Text style={styles.filterLabel}>Filter by Club</Text>
              <View style={styles.rowWrap}>
                <Pressable
                  onPress={() => setClubFeedFilterClubId("")}
                  style={[styles.pill, clubFeedFilterClubId === "" && styles.pillActive]}
                >
                  <Text style={[styles.pillText, clubFeedFilterClubId === "" && styles.pillTextActive]}>All Clubs</Text>
                </Pressable>
                {myClubs.slice(0, 20).map((club) => {
                  const active = clubFeedFilterClubId === club.id;
                  return (
                    <Pressable
                      key={`feed-filter-${club.id}`}
                      onPress={() => setClubFeedFilterClubId(club.id)}
                      style={[styles.pill, active && styles.pillActive]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{club.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          }
          ListEmptyComponent={<Text style={styles.hint}>No club posts yet. Join clubs to see activity.</Text>}
          renderItem={({ item: post }) => (
            <View style={styles.card}>
              <Text style={styles.clubName}>@{post.userId}</Text>
              <Text>{post.text}</Text>
            </View>
          )}
        />
      ) : null}

      <Modal
        visible={discoverCategoryPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDiscoverCategoryPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, styles.categoryModalCard]}>
            <Text style={styles.sectionTitle}>Select Category</Text>
            <TextInput
              value={discoverCategorySearch}
              onChangeText={setDiscoverCategorySearch}
              placeholder="Search categories"
              style={styles.input}
            />

            <Pressable
              onPress={() => {
                setDiscoverCategoryId("");
                setDiscoverCategoryPickerOpen(false);
              }}
              style={[styles.categoryRow, discoverCategoryId === "" && styles.categoryRowActive]}
            >
              <Text style={[styles.categoryRowText, discoverCategoryId === "" && styles.categoryRowTextActive]}>All</Text>
            </Pressable>

            <FlatList
              data={discoverModalCategories}
              keyExtractor={(item) => item.id}
              style={styles.categoryList}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={styles.hint}>No categories match your search.</Text>}
              renderItem={({ item }) => {
                const active = discoverCategoryId === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      setDiscoverCategoryId(item.id);
                      setDiscoverCategoryPickerOpen(false);
                    }}
                    style={[styles.categoryRow, active && styles.categoryRowActive]}
                  >
                    <Text style={[styles.categoryRowText, active && styles.categoryRowTextActive]}>{item.name}</Text>
                  </Pressable>
                );
              }}
            />

            <Pressable onPress={() => setDiscoverCategoryPickerOpen(false)} style={styles.buttonInline}>
              <Text style={styles.buttonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={createModalOpen} transparent animationType="fade" onRequestClose={() => setCreateModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreateModalOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Create a Club</Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <TextInput value={newClubTitle} onChangeText={setNewClubTitle} placeholder="Club title" style={styles.input} />
              <TextInput
                value={newClubDescription}
                onChangeText={setNewClubDescription}
                placeholder="Description (optional)"
                style={styles.input}
              />

              <CategorySelectorField
                label="Category"
                categories={categories}
                selectedCategoryId={selectedCategoryId}
                associatedCategoryIds={associatedCategoryIdsForCreate}
                onSelectCategory={setSelectedCategoryId}
              />

              <View style={styles.rowWrap}>
                <Pressable onPress={() => setNewClubIsPublic(true)} style={[styles.pill, newClubIsPublic && styles.pillActive]}>
                  <Text style={[styles.pillText, newClubIsPublic && styles.pillTextActive]}>Public</Text>
                </Pressable>
                <Pressable onPress={() => setNewClubIsPublic(false)} style={[styles.pill, !newClubIsPublic && styles.pillActive]}>
                  <Text style={[styles.pillText, !newClubIsPublic && styles.pillTextActive]}>Private</Text>
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.rowWrap}>
              <Pressable onPress={handleCreateClub} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Post Club</Text>
              </Pressable>
              <Pressable onPress={() => setCreateModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editModalOpen} transparent animationType="fade" onRequestClose={() => setEditModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.sectionTitle}>Modify Club</Text>
            <TextInput value={editClubName} onChangeText={setEditClubName} placeholder="Club title" style={styles.input} />
            <TextInput value={editClubDescription} onChangeText={setEditClubDescription} placeholder="Description" style={styles.input} />

            <View style={styles.rowWrap}>
              <Pressable onPress={() => setEditClubIsPublic(true)} style={[styles.pill, editClubIsPublic && styles.pillActive]}>
                <Text style={[styles.pillText, editClubIsPublic && styles.pillTextActive]}>Public</Text>
              </Pressable>
              <Pressable onPress={() => setEditClubIsPublic(false)} style={[styles.pill, !editClubIsPublic && styles.pillActive]}>
                <Text style={[styles.pillText, !editClubIsPublic && styles.pillTextActive]}>Private</Text>
              </Pressable>
            </View>

            <Text style={styles.filterLabel}>Join Rule</Text>
            <View style={styles.rowWrap}>
              {(["OPEN", "REQUEST_REQUIRED", "INVITE_ONLY"] as ClubJoinPolicy[]).map((policy) => {
                const active = editClubJoinPolicy === policy;
                return (
                  <Pressable key={`edit-join-policy-${policy}`} onPress={() => setEditClubJoinPolicy(policy)} style={[styles.pill, active && styles.pillActive]}>
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>{formatJoinPolicyLabel(policy)}</Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.rowWrap}>
              <Pressable onPress={handleSaveClubEdit} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Save</Text>
              </Pressable>
              <Pressable onPress={() => setEditModalOpen(false)} style={styles.buttonInline}>
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

    </>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8
  },
  filterLabel: {
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 6
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8
  },
  pill: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 10
  },
  pillActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  pillText: { fontSize: 12, fontWeight: "600", color: "#333" },
  pillTextActive: { color: "#fff" },
  sectionTitle: { fontWeight: "700", fontSize: 18, marginBottom: 6 },
  hint: { color: "#666", marginBottom: 8 },
  message: { color: "#0b57d0", marginBottom: 10 },
  card: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8
  },
  interactiveCard: {
    padding: 0,
    borderColor: "#bbb"
  },
  cardOpenArea: {
    padding: 10,
    borderRadius: 10
  },
  interactiveCardPressed: {
    backgroundColor: "#f3f6ff"
  },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  clubName: { fontWeight: "600", marginBottom: 6 },
  openHint: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0b57d0"
  },
  tapHint: {
    fontSize: 12,
    color: "#0b57d0",
    marginTop: 2
  },
  button: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center"
  },
  buttonDisabled: {
    opacity: 0.6,
    backgroundColor: "#f1f1f1"
  },
  buttonInline: {
    borderWidth: 1,
    borderColor: "#444",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  buttonInlineDisabled: {
    opacity: 0.6,
    backgroundColor: "#f1f1f1"
  },
  buttonInlineStrong: {
    borderWidth: 1,
    borderColor: "#111",
    backgroundColor: "#111",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: "center"
  },
  buttonTextInverse: {
    fontWeight: "600",
    color: "#fff"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    maxHeight: "85%"
  },
  modalScroll: {
    maxHeight: 420
  },
  modalScrollContent: {
    paddingBottom: 4
  },
  categoryModalCard: {
    maxHeight: "80%"
  },
  categoryList: {
    marginBottom: 12
  },
  categoryRow: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8
  },
  categoryRowActive: {
    backgroundColor: "#111",
    borderColor: "#111"
  },
  categoryRowText: {
    fontWeight: "600",
    color: "#222"
  },
  categoryRowTextActive: {
    color: "#fff"
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ececec"
  },
  historyRowLast: {
    borderBottomWidth: 0
  },
  historyIcon: {
    fontSize: 14,
    lineHeight: 20
  },
  historyBody: {
    flex: 1
  },
  historySummary: {
    fontSize: 14,
    color: "#222"
  },
  historyTimestamp: {
    marginTop: 3,
    fontSize: 12,
    color: "#777"
  },
  clubHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10
  },
  clubHeaderMain: {
    flex: 1
  },
  joinCtaBox: {
    minWidth: 132,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    backgroundColor: "#fafafa"
  },
  joinCtaTitle: {
    fontWeight: "700",
    marginBottom: 4
  },
  joinCtaHint: {
    fontSize: 12,
    color: "#666",
    marginBottom: 8
  },
  joinCtaStatus: {
    fontSize: 12,
    color: "#555",
    marginTop: 6
  },
  adminHeroCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#f6f9ff",
    borderWidth: 1,
    borderColor: "#d8e4ff"
  },
  adminHeroTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1b2a57",
    marginBottom: 4
  },
  adminHeroSubtitle: {
    color: "#51607f",
    marginBottom: 10
  },
  adminStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  adminStatCard: {
    minWidth: 96,
    flexGrow: 1,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d8e4ff",
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  adminStatValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111"
  },
  adminStatLabel: {
    marginTop: 2,
    fontSize: 12,
    color: "#5f6b84",
    fontWeight: "600"
  },
  adminSectionCard: {
    borderWidth: 1,
    borderColor: "#e4e7ee",
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    backgroundColor: "#fcfcfd"
  },
  adminRequestCard: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#fff"
  },
  adminRequestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  focusedTargetCard: {
    borderColor: "#9bb8f5",
    borderWidth: 1,
    backgroundColor: "#f6f9ff"
  },
  focusedTargetItem: {
    borderColor: "#9bb8f5",
    borderWidth: 1,
    backgroundColor: "#f6f9ff"
  },
  visibilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6
  },
  visibilityBadge: {
    borderWidth: 1,
    borderColor: "#a8c2ff",
    backgroundColor: "#eaf1ff",
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 8
  },
  visibilityBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1b2a57"
  },
  clubHighlightsList: {
    maxHeight: 340
  },
  buttonText: { fontWeight: "600" }
});
