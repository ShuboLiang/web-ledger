import { DeleteOutlined, SaveOutlined } from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { App, Button, Input, Modal, Select, Space } from "antd"
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { api, type FilterPreset } from "@/lib/api"

const MANAGE_KEY = "__manage__"

export function FilterPresets({
  page,
  buildParams,
  applyParams,
}: {
  page: string
  buildParams: () => string
  applyParams: (params: string) => void
}) {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [presetName, setPresetName] = useState("")
  const { data: presets } = useQuery({
    queryKey: ["filter-presets", page],
    queryFn: () => api<FilterPreset[]>(`/api/filter-presets?page=${page}`),
  })
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["filter-presets"] })
  const save = useMutation({
    mutationFn: (name: string) =>
      api<FilterPreset>("/api/filter-presets", {
        method: "POST",
        body: JSON.stringify({ page, name, params: buildParams() }),
      }),
    onSuccess: () => {
      message.success("筛选方案已保存")
      setSaving(false)
      setPresetName("")
      invalidate()
    },
    onError: (error: Error) => message.error(error.message),
  })
  const confirmSave = () => {
    const name = presetName.trim()
    if (!name) {
      message.warning("请输入方案名称")
      return
    }
    save.mutate(name)
  }
  const options = [
    ...(presets || []).map((preset) => ({
      value: preset.id,
      label: preset.name,
      params: preset.params,
    })),
    { value: MANAGE_KEY, label: "管理方案…", params: "" },
  ]
  return (
    <Space.Compact className="filter-presets">
      <Select
        allowClear
        placeholder="筛选方案"
        className="filter-presets-select"
        value={null}
        options={options}
        onSelect={(id, option) => {
          if (id === MANAGE_KEY) {
            navigate("/settings/presets")
            return
          }
          applyParams(String((option as { params?: string }).params || ""))
        }}
      />
      <Button
        icon={<SaveOutlined />}
        onClick={() => setSaving(true)}
        aria-label="保存当前筛选为方案"
      />
      <Modal
        title="保存筛选方案"
        open={saving}
        onOk={confirmSave}
        onCancel={() => setSaving(false)}
        okText="保存"
        cancelText="取消"
        confirmLoading={save.isPending}
        destroyOnHidden
      >
        <Input
          placeholder="方案名称，如：本周吃饭和日常"
          value={presetName}
          onChange={(event) => setPresetName(event.target.value)}
          onPressEnter={confirmSave}
          maxLength={40}
        />
      </Modal>
    </Space.Compact>
  )
}
