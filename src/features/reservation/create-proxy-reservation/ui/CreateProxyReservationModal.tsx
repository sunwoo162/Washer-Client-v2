"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { MachineItem } from "@/entities/machine";
import { usePostProxyReservation } from "@/entities/reservation";
import { getUsers, type ManagedUserItem } from "@/entities/user";
import { userQueryKeys } from "@/shared/api";
import { STALE_TIME } from "@/shared/constants/queryOptions";
import { useOutsideClick } from "@/shared/hooks/useOutsideClick";
import { FilterSearchField } from "@/shared/ui/admin/Filter";
import {
  getProxyReservationUserParams,
  isProxyReservationRoomPrefixSearch,
  mergeProxyReservationUsers,
  PROXY_RESERVATION_USER_PAGE_SIZE,
} from "../lib/getProxyReservationUserParams";

interface CreateProxyReservationModalProps {
  machine: MachineItem;
  onClose: () => void;
  side?: "left" | "right";
}

export default function CreateProxyReservationModal({
  machine,
  onClose,
  side = "right",
}: CreateProxyReservationModalProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const queryParams = useMemo(
    () =>
      getProxyReservationUserParams(debouncedSearch).map((params) => ({
        ...params,
        size: params.size ?? PROXY_RESERVATION_USER_PAGE_SIZE,
      })),
    [debouncedSearch],
  );
  const {
    data: users = [],
    isFetching,
    isLoading,
    isError,
    isPlaceholderData,
  } = useQuery({
    staleTime: STALE_TIME.USER,
    queryKey: [
      ...userQueryKeys.all,
      "proxy-reservation-search",
      queryParams,
    ] as const,
    queryFn: async () => {
      const isRoomPrefixSearch =
        isProxyReservationRoomPrefixSearch(debouncedSearch);
      const groups = await Promise.all(
        queryParams.map(async (params, index) => {
          if (!isRoomPrefixSearch || index !== 0) {
            return getUsers(params);
          }

          const floorUsers: ManagedUserItem[] = [];

          for (let page = 0; ; page += 1) {
            const pageUsers = await getUsers({
              ...params,
              page,
              size: PROXY_RESERVATION_USER_PAGE_SIZE,
            });
            floorUsers.push(...pageUsers);

            if (pageUsers.length < PROXY_RESERVATION_USER_PAGE_SIZE) {
              return floorUsers;
            }
          }
        }),
      );

      return mergeProxyReservationUsers(groups, debouncedSearch);
    },
    placeholderData: keepPreviousData,
  });
  const { mutate: createProxyReservation, isPending } =
    usePostProxyReservation();

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const isSearchSettled =
    search === debouncedSearch && !isFetching && !isPlaceholderData;
  const machineTypeLabel = machine.type === "WASHER" ? "세탁기" : "건조기";

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSelectedUserId(null);
  };

  const handleSubmit = () => {
    if (!selectedUser || isPending || !isSearchSettled) return;

    createProxyReservation(
      { userId: selectedUser.id, machineId: machine.id },
      {
        onSuccess: () => {
          toast.success("대리 예약에 성공했습니다.");
          onClose();
        },
        onError: (error) => {
          console.error("Proxy reservation creation failed:", error);
          toast.error(error.message || "대리 예약 생성에 실패했습니다.");
        },
      },
    );
  };

  useOutsideClick(
    panelRef,
    () => {
      if (!isPending) onClose();
    },
    true,
  );

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(handler);
  }, [search]);

  const overlayPositionClass =
    side === "right"
      ? "absolute left-[calc(100%+16px)] top-0 h-full w-full"
      : "absolute right-[calc(100%+16px)] top-0 h-full w-full";

  return (
    <div className={`${overlayPositionClass} z-30`}>
      <div
        ref={panelRef}
        className="relative flex h-full flex-col rounded-2xl border border-[#E5E7EB] bg-[#FDFDFD] px-4 py-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <div className="mb-5 flex shrink-0 items-center justify-between">
          <h2 className="text-[18px] font-medium text-[#4A4A4F]">
            {machine.name} 대리 예약
          </h2>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] transition hover:bg-[#ECECEC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-5 shrink-0">
          <p className="mb-2 text-sm text-[#71717A]">예약 기기</p>
          <div className="rounded-xl border border-[#E5E7EB] bg-white px-4 py-3">
            <p className="text-[15px] font-medium text-[#4A4A4F]">
              {machine.name} · {machineTypeLabel}
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-2 text-sm text-[#71717A]">사용자 선택</p>
          <FilterSearchField
            placeholder="이름 / 호실 / 학번 검색"
            value={search}
            onChange={handleSearchChange}
          />

          <div className="sidebar-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="flex h-28 items-center justify-center text-sm text-[#9A9AA0]">
                사용자 정보를 불러오는 중입니다...
              </div>
            ) : isError ? (
              <div className="flex h-28 items-center justify-center text-sm text-[#EF4B4F]">
                사용자 정보를 불러오지 못했습니다.
              </div>
            ) : users.length === 0 ? (
              <div className="flex h-28 items-center justify-center text-sm text-[#9A9AA0]">
                검색 결과가 없습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {users.map((user) => {
                  const isSelected = selectedUserId === user.id;

                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        if (isSearchSettled) setSelectedUserId(user.id);
                      }}
                      disabled={isPending || !isSearchSettled}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        isSelected
                          ? "border-[#4D83F6] bg-[#F4F7FF]"
                          : "border-[#E5E7EB] bg-white hover:border-[#BFCDF0]"
                      }`}
                    >
                      <span
                        className={`h-4 w-4 shrink-0 rounded-full border-2 ${
                          isSelected
                            ? "border-[5px] border-[#4D83F6]"
                            : "border-[#B7B7BD]"
                        }`}
                      />

                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-medium text-[#4A4A4F]">
                          {user.name}
                        </span>
                        <span className="mt-0.5 block text-sm text-[#9A9AA0]">
                          {user.room} · {user.studentNumber}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex shrink-0 gap-2 border-t border-[#E5E7EB] pt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="flex h-11 flex-1 items-center justify-center rounded-xl border border-[#E5E7EB] font-semibold text-[#71717A] transition hover:bg-[#F9FAFB] disabled:cursor-not-allowed disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedUser || isPending || !isSearchSettled}
            className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#4D83F6] font-semibold text-white transition hover:bg-[#3E72DC] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "예약 생성 중..." : "대리 예약"}
          </button>
        </div>
      </div>
    </div>
  );
}
