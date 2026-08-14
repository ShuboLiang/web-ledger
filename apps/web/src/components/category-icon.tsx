import {
  AccountBookOutlined,
  AimOutlined,
  AlertOutlined,
  ApartmentOutlined,
  ApiOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarcodeOutlined,
  BarChartOutlined,
  BellOutlined,
  BookOutlined,
  BuildOutlined,
  BulbOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  CameraOutlined,
  CarOutlined,
  CarryOutOutlined,
  ClockCircleOutlined,
  CloudOutlined,
  CodeOutlined,
  CoffeeOutlined,
  CommentOutlined,
  CompassOutlined,
  ContactsOutlined,
  ContainerOutlined,
  ControlOutlined,
  CreditCardOutlined,
  CrownOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeliveredProcedureOutlined,
  DesktopOutlined,
  DollarCircleOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  ExperimentOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FireOutlined,
  FlagOutlined,
  FolderOutlined,
  FundOutlined,
  GiftOutlined,
  GlobalOutlined,
  GoldOutlined,
  HddOutlined,
  HeartOutlined,
  HistoryOutlined,
  HomeOutlined,
  HourglassOutlined,
  IdcardOutlined,
  InboxOutlined,
  InsuranceOutlined,
  KeyOutlined,
  LaptopOutlined,
  LikeOutlined,
  LineChartOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  ManOutlined,
  MedicineBoxOutlined,
  MessageOutlined,
  MobileOutlined,
  MoneyCollectOutlined,
  MonitorOutlined,
  MoonOutlined,
  NotificationOutlined,
  PaperClipOutlined,
  PayCircleOutlined,
  PercentageOutlined,
  PhoneOutlined,
  PictureOutlined,
  PieChartOutlined,
  PlayCircleOutlined,
  PrinterOutlined,
  ProductOutlined,
  ProfileOutlined,
  ProjectOutlined,
  PropertySafetyOutlined,
  PushpinOutlined,
  QrcodeOutlined,
  ReadOutlined,
  ReconciliationOutlined,
  RedEnvelopeOutlined,
  RestOutlined,
  RobotOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  ScanOutlined,
  ScheduleOutlined,
  ScissorOutlined,
  SearchOutlined,
  SendOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  ShoppingOutlined,
  SkinOutlined,
  SmileOutlined,
  SoundOutlined,
  StarOutlined,
  StockOutlined,
  SunOutlined,
  TableOutlined,
  TabletOutlined,
  TagOutlined,
  TagsOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  TransactionOutlined,
  TranslationOutlined,
  TrophyOutlined,
  TruckOutlined,
  UsbOutlined,
  UserOutlined,
  VideoCameraOutlined,
  WalletOutlined,
  WarningOutlined,
  WifiOutlined,
  WomanOutlined,
} from "@ant-design/icons"
import { Empty, Input, Popover, Typography } from "antd"
import type { ComponentType } from "react"
import { useMemo, useState } from "react"

type IconDefinition = {
  name: string
  label: string
  group: string
  icon: ComponentType
}

const icon = (
  name: string,
  label: string,
  group: string,
  component: ComponentType,
): IconDefinition => ({ name, label, group, icon: component })

function DrinkOutlined() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 8h10l-1.2 12H8.2L7 8Z" />
      <path d="M6.5 8h11" />
      <path d="m13.5 8 1-4h3" />
      <path d="M8 12h8" opacity=".65" />
    </svg>
  )
}

export const categoryIcons: IconDefinition[] = [
  icon("folder", "其他支出", "常用账务", AppstoreOutlined),
  icon("folder-file", "待归类", "常用账务", FolderOutlined),
  icon("tag", "优惠券", "常用账务", TagOutlined),
  icon("tags", "促销折扣", "常用账务", TagsOutlined),
  icon("favorite", "心愿购买", "常用账务", StarOutlined),
  icon("pin", "固定支出", "常用账务", PushpinOutlined),
  icon("calendar", "周期账单", "常用账务", CalendarOutlined),
  icon("clock", "计时服务", "常用账务", ClockCircleOutlined),
  icon("history", "分期还款", "常用账务", HistoryOutlined),
  icon("hourglass", "延期付款", "常用账务", HourglassOutlined),
  icon("warning", "罚款违约", "常用账务", WarningOutlined),

  icon("food", "餐饮", "餐饮购物", CoffeeOutlined),
  icon("drink", "饮品", "餐饮购物", DrinkOutlined),
  icon("restaurant", "堂食", "餐饮购物", RestOutlined),
  icon("cooking", "家庭做饭", "餐饮购物", FireOutlined),
  icon("shopping", "购物", "餐饮购物", ShoppingOutlined),
  icon("shop", "商店", "餐饮购物", ShopOutlined),
  icon("cart", "购物车", "餐饮购物", ShoppingCartOutlined),
  icon("product", "商品", "餐饮购物", ProductOutlined),
  icon("gift", "礼物", "餐饮购物", GiftOutlined),
  icon("clothing", "服饰", "餐饮购物", SkinOutlined),
  icon("tailoring", "裁剪", "餐饮购物", ScissorOutlined),
  icon("gold", "珠宝", "餐饮购物", GoldOutlined),
  icon("crown", "精品", "餐饮购物", CrownOutlined),

  icon("transport", "驾车出行", "交通旅行", CarOutlined),
  icon("truck", "搬家货运", "交通旅行", TruckOutlined),
  icon("delivery", "外卖配送", "交通旅行", DeliveredProcedureOutlined),
  icon("travel", "住宿", "交通旅行", EnvironmentOutlined),
  icon("compass", "旅行团", "交通旅行", CompassOutlined),
  icon("navigation", "导航服务", "交通旅行", AimOutlined),
  icon("global", "境外消费", "交通旅行", GlobalOutlined),
  icon("flight", "航旅", "交通旅行", RocketOutlined),
  icon("destination", "景点门票", "交通旅行", FlagOutlined),
  icon("travel-bag", "行李托运", "交通旅行", CarryOutOutlined),
  icon("send", "快递寄件", "交通旅行", SendOutlined),
  icon("container", "仓储寄存", "交通旅行", ContainerOutlined),

  icon("home", "住房", "居家生活", HomeOutlined),
  icon("apartment", "房租", "居家生活", ApartmentOutlined),
  icon("utilities", "水电", "居家生活", ThunderboltOutlined),
  icon("lighting", "灯具照明", "居家生活", BulbOutlined),
  icon("internet", "宽带网络", "居家生活", WifiOutlined),
  icon("phone", "电话话费", "居家生活", PhoneOutlined),
  icon("maintenance", "维修", "居家生活", ToolOutlined),
  icon("renovation", "装修", "居家生活", BuildOutlined),
  icon("key", "配钥匙", "居家生活", KeyOutlined),
  icon("lock", "换门锁", "居家生活", LockOutlined),
  icon("bell", "门禁设备", "居家生活", BellOutlined),
  icon("property", "物业", "居家生活", PropertySafetyOutlined),

  icon("income", "收入", "财务", DollarOutlined),
  icon("coin", "现金支出", "财务", DollarCircleOutlined),
  icon("wallet", "日常零钱", "财务", WalletOutlined),
  icon("debt", "贷款还款", "财务", BankOutlined),
  icon("card", "信用卡还款", "财务", CreditCardOutlined),
  icon("payment", "移动支付", "财务", PayCircleOutlined),
  icon("money", "工资收款", "财务", MoneyCollectOutlined),
  icon("bookkeeping", "账务服务", "财务", AccountBookOutlined),
  icon("calculator", "税费", "财务", CalculatorOutlined),
  icon("percentage", "利率", "财务", PercentageOutlined),
  icon("stock", "股票", "财务", StockOutlined),
  icon("fund", "基金", "财务", FundOutlined),
  icon("pie-chart", "共同分摊", "财务", PieChartOutlined),
  icon("bar-chart", "家庭公账", "财务", BarChartOutlined),
  icon("line-chart", "投资理财", "财务", LineChartOutlined),
  icon("transaction", "转账", "财务", TransactionOutlined),
  icon("red-envelope", "红包", "财务", RedEnvelopeOutlined),
  icon("insurance", "保险", "财务", InsuranceOutlined),

  icon("work", "办公设备", "学习办公", LaptopOutlined),
  icon("desktop", "台式电脑", "学习办公", DesktopOutlined),
  icon("project", "项目垫付", "学习办公", ProjectOutlined),
  icon("profile", "会员服务", "学习办公", ProfileOutlined),
  icon("document", "文印资料", "学习办公", FileTextOutlined),
  icon("pdf", "电子资料", "学习办公", FilePdfOutlined),
  icon("education", "教材书籍", "学习办公", BookOutlined),
  icon("reading", "阅读订阅", "学习办公", ReadOutlined),
  icon("schedule", "课程报名", "学习办公", ScheduleOutlined),
  icon("audit", "咨询服务", "学习办公", AuditOutlined),
  icon("reconcile", "报销退款", "学习办公", ReconciliationOutlined),
  icon("contacts", "商务应酬", "学习办公", ContactsOutlined),
  icon("id-card", "证件办理", "学习办公", IdcardOutlined),
  icon("mail", "邮寄费用", "学习办公", MailOutlined),
  icon("inbox", "快递收件", "学习办公", InboxOutlined),
  icon("table", "办公家具", "学习办公", TableOutlined),
  icon("printer", "打印复印", "学习办公", PrinterOutlined),
  icon("attachment", "文具耗材", "学习办公", PaperClipOutlined),

  icon("mobile", "手机", "数码通讯", MobileOutlined),
  icon("tablet", "平板", "数码通讯", TabletOutlined),
  icon("camera", "相机", "数码通讯", CameraOutlined),
  icon("picture", "照片冲印", "数码通讯", PictureOutlined),
  icon("image-file", "相册制作", "数码通讯", FileImageOutlined),
  icon("video", "影音设备", "数码通讯", VideoCameraOutlined),
  icon("sound", "音响耳机", "数码通讯", SoundOutlined),
  icon("service", "售后维修", "数码通讯", CustomerServiceOutlined),
  icon("cloud", "云盘会员", "数码通讯", CloudOutlined),
  icon("storage", "硬盘存储", "数码通讯", HddOutlined),
  icon("usb", "数码配件", "数码通讯", UsbOutlined),
  icon("scan", "扫描打印", "数码通讯", ScanOutlined),
  icon("robot", "智能家电", "数码通讯", RobotOutlined),
  icon("monitor", "显示器", "数码通讯", MonitorOutlined),
  icon("setting", "安装调试", "数码通讯", SettingOutlined),

  icon("health", "医疗", "健康家庭", MedicineBoxOutlined),
  icon("experiment", "体检化验", "健康家庭", ExperimentOutlined),
  icon("care", "亲友关爱", "健康家庭", HeartOutlined),
  icon("safety-cert", "疫苗保健", "健康家庭", SafetyCertificateOutlined),
  icon("safety", "防护用品", "健康家庭", SafetyOutlined),
  icon("family", "家庭开支", "健康家庭", TeamOutlined),
  icon("person", "个人护理", "健康家庭", UserOutlined),
  icon("man", "男士护理", "健康家庭", ManOutlined),
  icon("woman", "女士护理", "健康家庭", WomanOutlined),
  icon("smile", "口腔护理", "健康家庭", SmileOutlined),
  icon("alert", "急诊", "健康家庭", AlertOutlined),
  icon("sun", "防晒用品", "健康家庭", SunOutlined),
  icon("moon", "睡眠用品", "健康家庭", MoonOutlined),

  icon("entertainment", "影音娱乐", "休闲娱乐", PlayCircleOutlined),
  icon("trophy", "运动赛事", "休闲娱乐", TrophyOutlined),
  icon("translation", "翻译服务", "学习办公", TranslationOutlined),
]

const iconMap = new Map(categoryIcons.map((item) => [item.name, item]))
const iconGroups = [...new Set(categoryIcons.map((item) => item.group))]

export function CategoryIcon({
  name,
  size = "medium",
  className = "",
}: {
  name?: string | null
  size?: "small" | "medium" | "large"
  className?: string
}) {
  const definition = iconMap.get(name || "") || iconMap.get("folder")!
  const Icon = definition.icon
  return (
    <span
      className={`category-icon-stamp category-icon-stamp-${size} ${className}`.trim()}
      aria-hidden="true"
    >
      <Icon />
    </span>
  )
}

export function CategoryIconPicker({
  value,
  onChange,
}: {
  value?: string
  onChange?: (value: string) => void
}) {
  const [query, setQuery] = useState("")
  const selected = iconMap.get(value || "") || iconMap.get("folder")!
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(
    () =>
      normalizedQuery
        ? categoryIcons.filter((item) =>
            `${item.label} ${item.name} ${item.group}`
              .toLowerCase()
              .includes(normalizedQuery),
          )
        : categoryIcons,
    [normalizedQuery],
  )
  return (
    <Popover
      trigger="click"
      placement="bottomLeft"
      title={
        <div className="category-icon-library-title">
          <span>选择分类图标</span>
          <Typography.Text type="secondary">
            {filtered.length} / {categoryIcons.length}
          </Typography.Text>
        </div>
      }
      content={
        <div className="category-icon-library-shell">
          <Input
            allowClear
            autoFocus
            prefix={<SearchOutlined />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索餐饮、交通、财务……"
            aria-label="搜索分类图标"
          />
          <div className="category-icon-library" role="listbox" aria-label="分类图标库">
            {filtered.length ? (
              iconGroups.map((group) => {
                const items = filtered.filter((item) => item.group === group)
                if (!items.length) return null
                return (
                  <section className="category-icon-group" key={group}>
                    <Typography.Text className="category-icon-group-title">
                      {group}
                    </Typography.Text>
                    <div className="category-icon-group-grid">
                      {items.map((item) => (
                        <button
                          type="button"
                          key={item.name}
                          role="option"
                          aria-selected={item.name === selected.name}
                          className={`category-icon-choice${item.name === selected.name ? " selected" : ""}`}
                          onClick={() => onChange?.(item.name)}
                        >
                          <CategoryIcon name={item.name} size="medium" />
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )
              })
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的图标" />
            )}
          </div>
        </div>
      }
    >
      <button type="button" className="category-icon-picker-trigger">
        <CategoryIcon name={selected.name} size="large" />
        <span>
          <Typography.Text strong>{selected.label}</Typography.Text>
          <Typography.Text type="secondary">
            从 {categoryIcons.length} 个图标中选择
          </Typography.Text>
        </span>
      </button>
    </Popover>
  )
}
