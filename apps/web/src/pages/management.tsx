import {
  DeleteOutlined,
  EditOutlined,
  MergeOutlined,
  MoreOutlined,
  PlusOutlined,
  PoweroffOutlined,
} from "@ant-design/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Drawer,
  Dropdown,
  Flex,
  Form,
  Input,
  List,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from "antd"
import { useMemo, useState } from "react"
import { CategoryIcon, CategoryIconPicker } from "@/components/category-icon"
import { api } from "@/lib/api"

type Category = {
  id: string
  category1: string
  category2: string
  primaryIcon: string
  secondaryIcon: string
  enabled: boolean
  usageCount: number
  mergedIntoId?: string | null
  mergedInto?: { id: string; category1: string; category2: string } | null
}
type ManagementData = { categories: Category[]; budgets: any[] }
type Action =
  | { kind: "edit" | "merge"; category: Category }
  | { kind: "rename-primary"; primary: string }
  | { kind: "icon-primary"; primary: string; icon: string }
  | null

export function ManagementPage() {
  const [creator, setCreator] = useState(false)
  const [action, setAction] = useState<Action>(null)
  const [createForm] = Form.useForm()
  const [actionForm] = Form.useForm()
  const queryClient = useQueryClient()
  const { message, modal } = App.useApp()
  const { data, isLoading } = useQuery({
    queryKey: ["management"],
    queryFn: () => api<ManagementData>("/api/management"),
  })
  const refresh = () => queryClient.invalidateQueries()
  const create = useMutation({
    mutationFn: (values: any) =>
      api("/api/management/categories", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      setCreator(false)
      createForm.resetFields()
      await refresh()
      message.success("分类已新增")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const toggle = useMutation({
    mutationFn: ({ type, id, enabled }: any) =>
      api(`/api/management/${type}/${id}/enabled`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: async (_, variables) => {
      await refresh()
      message.success(variables.enabled ? "已启用" : "已停用，历史数据保持不变")
    },
    onError: (error: Error) => message.error(error.message),
  })
  const categoryAction = useMutation({
    mutationFn: ({ url, method, body }: any) =>
      api<any>(url, {
        method,
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    onSuccess: async (response) => {
      setAction(null)
      actionForm.resetFields()
      await refresh()
      message.success(
        response.updatedTransactions
          ? `操作成功，同步更新 ${response.updatedTransactions} 笔历史账目`
          : "操作成功",
      )
    },
    onError: (error: Error) => message.error(error.message),
  })
  const groups = useMemo(
    () =>
      [...new Set(data?.categories.map((row) => row.category1))].map(
        (name) => ({
          name,
          children:
            data?.categories.filter((row) => row.category1 === name) || [],
        }),
      ),
    [data?.categories],
  )
  const openCreate = () => {
    setCreator(true)
    createForm.resetFields()
    createForm.setFieldValue("secondaryIcon", "tag")
  }
  const openAction = (next: Exclude<Action, null>) => {
    setAction(next)
    actionForm.resetFields()
    if (next.kind === "edit")
      actionForm.setFieldsValue({
        category1: next.category.category1,
        category2: next.category.category2,
        primaryIcon: next.category.primaryIcon,
        secondaryIcon: next.category.secondaryIcon,
      })
    if (next.kind === "rename-primary")
      actionForm.setFieldValue("to", next.primary)
    if (next.kind === "icon-primary")
      actionForm.setFieldValue("primaryIcon", next.icon)
  }
  const deleteCategory = (category: Category) =>
    category.usageCount
      ? modal.warning({
          title: "该分类不能删除",
          content: `仍被 ${category.usageCount} 笔账目使用，请改用停用或合并。`,
        })
      : modal.confirm({
          title: "永久删除分类",
          content: `确定永久删除“${category.category1} / ${category.category2}”吗？`,
          okText: "永久删除",
          okButtonProps: { danger: true },
          onOk: () =>
            categoryAction.mutateAsync({
              url: `/api/management/categories/${category.id}`,
              method: "DELETE",
            }),
        })
  const deletePrimary = (primary: string, children: Category[]) => {
    const usage = children.reduce((sum, row) => sum + row.usageCount, 0)
    const budgets =
      data?.budgets.filter((row) => row.category1 === primary).length || 0
    if (usage || budgets)
      return modal.warning({
        title: "该一级分类不能删除",
        content: `仍关联 ${usage} 笔账目、${budgets} 条预算，请先停用或合并。`,
      })
    return modal.confirm({
      title: "永久删除一级分类",
      content: `将同时删除“${primary}”下的 ${children.length} 个二级分类。`,
      okText: "永久删除",
      okButtonProps: { danger: true },
      onOk: () =>
        categoryAction.mutateAsync({
          url: `/api/management/categories/primary/${encodeURIComponent(primary)}`,
          method: "DELETE",
        }),
    })
  }
  return (
    <div className="page-stack">
      <Card
        loading={isLoading}
        className="section-card"
        title={
          <div>
            <Typography.Text strong>一级分类与二级分类</Typography.Text>
            <Typography.Paragraph type="secondary" className="card-subtitle">
              停用保留历史；重命名、移动和合并会同步历史统计；仅无引用分类可永久删除。
            </Typography.Paragraph>
          </div>
        }
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增分类
          </Button>
        }
      >
        <Row gutter={[16, 16]}>
          {groups.map((group) => {
            const usage = group.children.reduce(
              (sum, row) => sum + row.usageCount,
              0,
            )
            const primaryMenu = {
              items: [
                {
                  key: "icon",
                  label: "更换一级分类图标",
                  onClick: () =>
                    openAction({
                      kind: "icon-primary",
                      primary: String(group.name),
                      icon: group.children[0]?.primaryIcon || "folder",
                    }),
                },
                {
                  key: "rename",
                  icon: <EditOutlined />,
                  label: "重命名一级分类",
                  onClick: () =>
                    openAction({
                      kind: "rename-primary",
                      primary: String(group.name),
                    }),
                },
                {
                  key: "delete",
                  danger: true,
                  icon: <DeleteOutlined />,
                  label: "永久删除一级分类",
                  onClick: () =>
                    deletePrimary(String(group.name), group.children),
                },
              ],
            }
            return (
              <Col xs={24} md={12} xl={8} key={String(group.name)}>
                <Card
                  size="small"
                  className="category-card"
                  title={
                    <Flex gap={10} align="center">
                      <CategoryIcon
                        name={group.children[0]?.primaryIcon}
                        size="large"
                      />
                      <div>
                        <Typography.Text strong>
                          {String(group.name)}
                        </Typography.Text>
                        <Typography.Text
                          type="secondary"
                          className="block-text"
                        >
                          {group.children.length} 项 · {usage} 笔账目
                        </Typography.Text>
                      </div>
                    </Flex>
                  }
                  extra={
                    <Dropdown menu={primaryMenu}>
                      <Button
                        type="text"
                        icon={<MoreOutlined />}
                        aria-label={`${group.name}一级分类操作`}
                      />
                    </Dropdown>
                  }
                >
                  <List
                    dataSource={group.children}
                    renderItem={(child) => {
                      const menu = {
                        items: [
                          {
                            key: "edit",
                            icon: <EditOutlined />,
                            label: "重命名或移动",
                            onClick: () =>
                              openAction({ kind: "edit", category: child }),
                          },
                          {
                            key: "merge",
                            icon: <MergeOutlined />,
                            label: "合并到其他分类",
                            onClick: () =>
                              openAction({ kind: "merge", category: child }),
                          },
                          ...(!child.mergedIntoId
                            ? [
                                {
                                  key: "toggle",
                                  icon: <PoweroffOutlined />,
                                  label: child.enabled ? "停用" : "重新启用",
                                  onClick: () =>
                                    toggle.mutate({
                                      type: "categories",
                                      id: child.id,
                                      enabled: !child.enabled,
                                    }),
                                },
                              ]
                            : []),
                          {
                            key: "delete",
                            danger: true,
                            icon: <DeleteOutlined />,
                            label: "永久删除",
                            onClick: () => deleteCategory(child),
                          },
                        ],
                      }
                      return (
                        <List.Item
                          extra={
                            <Dropdown menu={menu}>
                              <Button
                                type="text"
                                icon={<MoreOutlined />}
                                aria-label={`${child.category2}分类操作`}
                              />
                            </Dropdown>
                          }
                        >
                          <List.Item.Meta
                            avatar={
                              <CategoryIcon
                                name={child.secondaryIcon}
                                size="small"
                              />
                            }
                            title={
                              <Space>
                                <Typography.Text delete={!child.enabled}>
                                  {child.category2}
                                </Typography.Text>
                                <Tag
                                  color={
                                    child.mergedInto
                                      ? "purple"
                                      : child.enabled
                                        ? "green"
                                        : "default"
                                  }
                                >
                                  {child.mergedInto
                                    ? "已合并"
                                    : child.enabled
                                      ? "使用中"
                                      : "已停用"}
                                </Tag>
                              </Space>
                            }
                            description={
                              child.mergedInto
                                ? `已合并至 ${child.mergedInto.category1} / ${child.mergedInto.category2}`
                                : `${child.usageCount} 笔账目`
                            }
                          />
                        </List.Item>
                      )
                    }}
                  />
                </Card>
              </Col>
            )
          })}
        </Row>
      </Card>
      <Drawer
        className="responsive-drawer"
        title="新增分类"
        open={creator}
        width={480}
        onClose={() => setCreator(false)}
        footer={
          <Flex justify="flex-end" gap={8}>
            <Button onClick={() => setCreator(false)}>取消</Button>
            <Button
              type="primary"
              loading={create.isPending}
              onClick={() => createForm.submit()}
            >
              保存
            </Button>
          </Flex>
        }
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => create.mutate(values)}
        >
          <Form.Item
            name="category1"
            label="一级分类"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="category2"
            label="二级分类"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
          <div className="category-icon-form-grid">
            <Form.Item name="primaryIcon" label="一级分类图标">
              <CategoryIconPicker />
            </Form.Item>
            <Form.Item name="secondaryIcon" label="二级分类图标">
              <CategoryIconPicker />
            </Form.Item>
          </div>
        </Form>
      </Drawer>
      <CategoryActionDrawer
        action={action}
        categories={data?.categories || []}
        form={actionForm}
        loading={categoryAction.isPending}
        onClose={() => setAction(null)}
        onSubmit={(payload) => categoryAction.mutate(payload)}
      />
    </div>
  )
}

function CategoryActionDrawer({
  action,
  categories,
  form,
  loading,
  onClose,
  onSubmit,
}: {
  action: Action
  categories: Category[]
  form: any
  loading: boolean
  onClose: () => void
  onSubmit: (value: any) => void
}) {
  if (!action) return null
  const isEdit = action.kind === "edit"
  const isMerge = action.kind === "merge"
  const category = isEdit || isMerge ? action.category : null
  const primary = action.kind === "rename-primary" ? action.primary : ""
  const iconPrimary = action.kind === "icon-primary" ? action.primary : ""
  const title = isEdit
    ? "重命名或移动分类"
    : isMerge
      ? "合并分类"
      : action.kind === "icon-primary"
        ? "更换一级分类图标"
        : "重命名一级分类"
  const description = isMerge
    ? `“${category!.category1} / ${category!.category2}”的 ${category!.usageCount} 笔账目会迁移到目标分类。`
    : isEdit
      ? `将同步更新 ${category!.usageCount} 笔历史账目。`
      : action.kind === "icon-primary"
        ? `“${iconPrimary}”下的所有二级分类会共用这个一级图标。`
        : `将同步修改“${primary}”下的全部分类、账目和预算。`
  const submit = (values: any) =>
    isEdit
      ? onSubmit({
          url: `/api/management/categories/${category!.id}`,
          method: "PATCH",
          body: values,
        })
      : isMerge
        ? onSubmit({
            url: `/api/management/categories/${category!.id}/merge`,
            method: "POST",
            body: values,
          })
        : action.kind === "icon-primary"
          ? onSubmit({
              url: `/api/management/categories/primary/${encodeURIComponent(iconPrimary)}/icon`,
              method: "PATCH",
              body: { primaryIcon: values.primaryIcon },
            })
          : onSubmit({
              url: "/api/management/categories/primary/rename",
              method: "PATCH",
              body: { from: primary, to: values.to },
            })
  return (
    <Drawer
      title={title}
      open
      width={480}
      onClose={onClose}
      footer={
        <Flex justify="flex-end" gap={8}>
          <Button onClick={onClose}>取消</Button>
          <Button
            type="primary"
            loading={loading}
            onClick={() => form.submit()}
          >
            {isMerge ? "确认合并" : "保存修改"}
          </Button>
        </Flex>
      }
    >
      <Alert
        type={isMerge ? "warning" : "info"}
        showIcon
        message={description}
        style={{ marginBottom: 20 }}
      />
      <Form form={form} layout="vertical" onFinish={submit}>
        {isEdit && (
          <>
            <Form.Item
              name="category1"
              label="一级分类"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="category2"
              label="二级分类"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="secondaryIcon" label="二级分类图标">
              <CategoryIconPicker />
            </Form.Item>
          </>
        )}
        {isMerge && (
          <Form.Item
            name="targetId"
            label="目标分类"
            rules={[{ required: true }]}
          >
            <Select
              options={categories
                .filter((row) => row.id !== category!.id && !row.mergedIntoId)
                .map((row) => ({
                  label: `${row.category1} / ${row.category2}${row.enabled ? "" : "（将自动启用）"}`,
                  value: row.id,
                }))}
            />
          </Form.Item>
        )}
        {action.kind === "rename-primary" && (
          <Form.Item name="to" label="新名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        )}
        {action.kind === "icon-primary" && (
          <Form.Item name="primaryIcon" label="一级分类图标">
            <CategoryIconPicker />
          </Form.Item>
        )}
      </Form>
    </Drawer>
  )
}
