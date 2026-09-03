export type PublicLocale = 'en' | 'vi';

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export const GITHUB_URL = 'https://github.com/Phieu-Tran/Mindoist';
export const SUPPORT_EMAIL = 'hieutran111zx@gmail.com';

export function getStatusPageUrl() {
  return (import.meta.env.VITE_STATUS_PAGE_URL ?? '').trim();
}

export function getPublicLocale(language?: string): PublicLocale {
  return language?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export const publicCopy = {
  en: {
    nav: {
      home: 'Home',
      features: 'Features',
      privacy: 'Privacy',
      terms: 'Terms',
      github: 'GitHub',
      login: 'Log in',
      register: 'Get started',
      legal: 'Legal links',
      status: 'Service status',
    },
    landing: {
      eyebrow: 'A calmer place for your work',
      title: 'Plan what matters without turning your day into noise.',
      description: 'Mindoist brings tasks, projects, notes, focus sessions, and a practical calendar into one focused workspace.',
      primaryAction: 'Start using Mindoist',
      secondaryAction: 'View source on GitHub',
      previewLabel: 'A clear plan at a glance',
      previewToday: 'Today',
      previewTaskOne: 'Review project direction',
      previewTaskTwo: 'Prepare launch notes',
      previewCalendar: 'Calendar',
      previewProject: 'Website launch',
      featuresTitle: 'From a quick thought to a realistic plan',
      featuresDescription: 'Keep the system simple, then add structure only when the work needs it.',
      features: [
        {
          title: 'Capture first',
          body: 'Send new thoughts to Inbox, then organize them into projects, dates, and priorities when you have context.',
        },
        {
          title: 'Plan by project',
          body: 'Use list, board, and calendar views to see the same work from the angle that helps you move it forward.',
        },
        {
          title: 'Connect Google on your terms',
          body: 'Choose which Mindoist projects sync. Google-origin events remain a read-only overlay and are never deleted by Mindoist.',
        },
      ],
      calendarEyebrow: 'Google Calendar integration',
      calendarTitle: 'A clear boundary between your calendars.',
      calendarDescription: 'Mindoist only syncs projects you explicitly enable. Tasks from those projects can create linked Google events. Events that came from Google are shown in Mindoist for context, but Mindoist does not edit or delete those original events.',
      calendarPoints: [
        'Project-by-project sync control',
        'Google events shown as read-only context',
        'Disconnect or revoke access whenever you want',
      ],
      ctaTitle: 'Ready for a quieter way to plan?',
      ctaBody: 'Create an account or sign in with Google to start your workspace.',
      statusEyebrow: 'Service status',
      statusTitle: 'See Mindoist availability in real time.',
      statusDescription: 'Check the live status of Mindoist services and ongoing incidents.',
      statusLink: 'View live status',
    },
    privacy: {
      title: 'Privacy Policy',
      description: 'How Mindoist collects, uses, and protects your information, including data received through Google services.',
      effective: 'Effective August 1, 2026',
      sections: [
        {
          id: 'overview',
          title: '1. Overview',
          paragraphs: [
            'This Privacy Policy explains how Mindoist handles information when you use the Mindoist website and connected services. By using Mindoist, you acknowledge the practices described here.',
          ],
        },
        {
          id: 'information',
          title: '2. Information we collect',
          paragraphs: ['We collect only the information needed to provide and operate the service.'],
          bullets: [
            'Account information, such as your name, email address, time zone, and securely hashed password when you create one.',
            'Content you add to Mindoist, such as tasks, projects, notes, dates, reminders, preferences, and focus-session records.',
            'Basic technical information needed for security, diagnostics, and reliable operation of the service.',
          ],
        },
        {
          id: 'google-data',
          title: '3. Google user data',
          paragraphs: [
            'Google access is optional and begins only after you choose a Google sign-in or connection flow and grant permission.',
            'For Google sign-in, Mindoist receives basic identity information such as your name, email address, and Google account identifier. For Google Calendar, Mindoist reads calendar and event information so it can show your schedule and sync only the Mindoist projects you explicitly enable. Google-origin events are read-only inside Mindoist: Mindoist does not edit or delete them. Mindoist may create, update, or delete only Google events that were created from tasks in a project you selected for sync.',
            'If you choose Google Drive backup, Mindoist accesses only the app files it creates or that you explicitly select for that feature. Mindoist stores Google authorization credentials needed to keep a connection active until you disconnect it, revoke access, or delete your account.',
          ],
        },
        {
          id: 'use-and-sharing',
          title: '4. How we use and share information',
          paragraphs: [
            'We use your information to provide Mindoist features, authenticate your account, synchronize data you request, maintain security, troubleshoot problems, and improve reliability.',
            'Mindoist does not sell your personal information or Google user data. We do not use Google user data for advertising, and we do not use it to train generalized artificial-intelligence models. We may use service providers only where needed to operate Mindoist, and may disclose information when required by applicable law or to protect users and the service.',
          ],
        },
        {
          id: 'limited-use',
          title: '5. Google API Services User Data Policy',
          paragraphs: [
            'Mindoist’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.',
          ],
        },
        {
          id: 'security',
          title: '6. Security',
          paragraphs: [
            'We use reasonable technical and organizational measures to protect account and connection data. No internet service can guarantee absolute security, so you should also protect your account credentials and devices.',
          ],
        },
        {
          id: 'retention',
          title: '7. Retention and your controls',
          paragraphs: [
            'We keep information while your account is active and as needed to provide the service. You can disconnect a Google account in Mindoist or revoke access from your Google Account permissions. You can also delete your Mindoist account from Settings; this removes account data from Mindoist subject to limited retention required for security, legal, or backup-cycle purposes.',
            'Disconnecting or deleting Mindoist does not delete events originally created in Google Calendar. Events that Mindoist created in Google Calendar remain governed by the action you request and Google Calendar itself.',
          ],
        },
        {
          id: 'changes-contact',
          title: '8. Changes and contact',
          paragraphs: [
            `We may update this policy as Mindoist changes. The effective date above identifies the latest version. Questions or privacy requests can be sent to ${SUPPORT_EMAIL}.`,
          ],
        },
      ] satisfies LegalSection[],
    },
    terms: {
      title: 'Terms of Service',
      description: 'The rules and responsibilities that apply when you use Mindoist and its optional integrations.',
      effective: 'Effective August 1, 2026',
      sections: [
        {
          id: 'acceptance',
          title: '1. Acceptance',
          paragraphs: ['By accessing or using Mindoist, you agree to these Terms. If you do not agree, do not use the service.'],
        },
        {
          id: 'account',
          title: '2. Your account',
          paragraphs: ['You are responsible for providing accurate account information, protecting your sign-in credentials, and activity performed through your account. Tell us promptly if you believe your account has been compromised.'],
        },
        {
          id: 'service',
          title: '3. Using Mindoist',
          paragraphs: ['Mindoist provides task, project, note, planning, focus, calendar, and backup tools. You may use the service only lawfully and must not interfere with its operation, attempt unauthorized access, distribute malware, or abuse other users or connected services.'],
        },
        {
          id: 'content',
          title: '4. Your content',
          paragraphs: ['You retain ownership of content you add to Mindoist. You grant Mindoist the limited permission needed to store, process, display, and synchronize that content solely to provide the features you request. You are responsible for having the right to use the content you submit.'],
        },
        {
          id: 'integrations',
          title: '5. Google and third-party integrations',
          paragraphs: [
            'Connected services are optional and are also subject to their providers’ terms. You control which Mindoist projects synchronize with Google Calendar. Mindoist treats Google-origin calendar events as read-only and does not delete them; it manages only linked events Mindoist created for projects you selected.',
            'A third-party service may change, limit, or stop its API. Mindoist is not responsible for third-party outages or changes, but you can disconnect an integration at any time.',
          ],
        },
        {
          id: 'availability',
          title: '6. Availability and changes',
          paragraphs: ['We aim to keep Mindoist reliable, but the service may occasionally be unavailable. We may change, suspend, or discontinue features, and will provide reasonable notice when a change materially affects users where practical.'],
        },
        {
          id: 'termination',
          title: '7. Suspension and termination',
          paragraphs: ['You may stop using Mindoist or delete your account at any time. We may suspend or terminate access when reasonably necessary to address abuse, security risk, legal obligations, or a material breach of these Terms.'],
        },
        {
          id: 'disclaimer',
          title: '8. Disclaimer and liability',
          paragraphs: ['Mindoist is provided on an “as available” basis. To the extent permitted by law, we do not guarantee uninterrupted or error-free operation and are not liable for indirect or consequential loss resulting from use of the service. Nothing in these Terms excludes rights or liability that cannot legally be excluded.'],
        },
        {
          id: 'changes-contact',
          title: '9. Changes and contact',
          paragraphs: [`We may update these Terms as the service changes. The effective date above identifies the latest version. Questions can be sent to ${SUPPORT_EMAIL}.`],
        },
      ] satisfies LegalSection[],
    },
  },
  vi: {
    nav: {
      home: 'Trang chủ',
      features: 'Tính năng',
      privacy: 'Quyền riêng tư',
      terms: 'Điều khoản',
      github: 'GitHub',
      login: 'Đăng nhập',
      register: 'Bắt đầu',
      legal: 'Liên kết pháp lý',
      status: 'Trạng thái dịch vụ',
    },
    landing: {
      eyebrow: 'Một nơi nhẹ nhàng hơn cho công việc',
      title: 'Lên kế hoạch cho điều quan trọng mà không biến ngày của bạn thành mớ hỗn độn.',
      description: 'Mindoist kết hợp công việc, dự án, ghi chú, phiên tập trung và lịch thực tế trong một không gian làm việc tập trung.',
      primaryAction: 'Bắt đầu dùng Mindoist',
      secondaryAction: 'Xem mã nguồn trên GitHub',
      previewLabel: 'Kế hoạch rõ ràng trong nháy mắt',
      previewToday: 'Hôm nay',
      previewTaskOne: 'Xem lại hướng đi dự án',
      previewTaskTwo: 'Chuẩn bị ghi chú ra mắt',
      previewCalendar: 'Lịch',
      previewProject: 'Ra mắt website',
      featuresTitle: 'Từ một ý nghĩ nhanh đến kế hoạch thực tế',
      featuresDescription: 'Giữ hệ thống đơn giản, chỉ thêm cấu trúc khi công việc thực sự cần.',
      features: [
        {
          title: 'Ghi lại trước',
          body: 'Đưa ý tưởng mới vào Inbox rồi sắp xếp thành dự án, ngày và mức ưu tiên khi bạn đã có đủ ngữ cảnh.',
        },
        {
          title: 'Lên kế hoạch theo dự án',
          body: 'Dùng danh sách, bảng và lịch để nhìn cùng một công việc theo góc phù hợp nhất để tiến lên.',
        },
        {
          title: 'Kết nối Google theo cách của bạn',
          body: 'Chọn dự án Mindoist nào được đồng bộ. Sự kiện gốc từ Google chỉ được hiển thị và Mindoist không bao giờ xoá chúng.',
        },
      ],
      calendarEyebrow: 'Tích hợp Google Calendar',
      calendarTitle: 'Ranh giới rõ ràng giữa các lịch của bạn.',
      calendarDescription: 'Mindoist chỉ đồng bộ những dự án bạn chủ động bật. Công việc trong các dự án đó có thể tạo sự kiện Google được liên kết. Sự kiện đến từ Google được hiển thị trong Mindoist để tham khảo, nhưng Mindoist không sửa hoặc xoá những sự kiện gốc đó.',
      calendarPoints: [
        'Kiểm soát đồng bộ theo từng dự án',
        'Sự kiện Google chỉ hiển thị để tham khảo',
        'Ngắt kết nối hoặc thu hồi quyền bất cứ lúc nào',
      ],
      ctaTitle: 'Sẵn sàng cho cách lên kế hoạch yên tĩnh hơn?',
      ctaBody: 'Tạo tài khoản hoặc đăng nhập bằng Google để bắt đầu không gian của bạn.',
      statusEyebrow: 'Trạng thái dịch vụ',
      statusTitle: 'Xem tình trạng hoạt động của Mindoist theo thời gian thực.',
      statusDescription: 'Kiểm tra trạng thái các dịch vụ Mindoist và sự cố đang diễn ra.',
      statusLink: 'Xem trạng thái trực tiếp',
    },
    privacy: {
      title: 'Chính sách quyền riêng tư',
      description: 'Cách Mindoist thu thập, sử dụng và bảo vệ thông tin của bạn, bao gồm dữ liệu nhận qua các dịch vụ Google.',
      effective: 'Có hiệu lực từ ngày 01/08/2026',
      sections: [
        {
          id: 'overview',
          title: '1. Tổng quan',
          paragraphs: ['Chính sách này giải thích cách Mindoist xử lý thông tin khi bạn dùng website Mindoist và các dịch vụ được kết nối. Khi sử dụng Mindoist, bạn xác nhận đã biết các nguyên tắc được mô tả tại đây.'],
        },
        {
          id: 'information',
          title: '2. Thông tin chúng tôi thu thập',
          paragraphs: ['Chúng tôi chỉ thu thập thông tin cần thiết để cung cấp và vận hành dịch vụ.'],
          bullets: [
            'Thông tin tài khoản như tên, email, múi giờ và mật khẩu đã được băm an toàn nếu bạn tạo mật khẩu.',
            'Nội dung bạn thêm vào Mindoist như công việc, dự án, ghi chú, ngày, lời nhắc, tuỳ chọn và lịch sử phiên tập trung.',
            'Thông tin kỹ thuật cơ bản cần thiết cho bảo mật, chẩn đoán và vận hành dịch vụ ổn định.',
          ],
        },
        {
          id: 'google-data',
          title: '3. Dữ liệu người dùng Google',
          paragraphs: [
            'Quyền truy cập Google là tuỳ chọn và chỉ bắt đầu sau khi bạn chọn đăng nhập hoặc kết nối Google và cấp quyền.',
            'Khi đăng nhập Google, Mindoist nhận thông tin định danh cơ bản như tên, email và mã tài khoản Google. Với Google Calendar, Mindoist đọc thông tin lịch và sự kiện để hiển thị lịch trình, đồng thời chỉ đồng bộ các dự án Mindoist mà bạn chủ động bật. Sự kiện gốc từ Google ở chế độ chỉ đọc trong Mindoist: Mindoist không sửa hoặc xoá chúng. Mindoist chỉ có thể tạo, cập nhật hoặc xoá sự kiện Google đã được tạo từ công việc thuộc dự án bạn chọn đồng bộ.',
            'Nếu bạn chọn sao lưu Google Drive, Mindoist chỉ truy cập tệp ứng dụng do Mindoist tạo hoặc tệp bạn chủ động chọn cho tính năng đó. Mindoist lưu thông tin uỷ quyền Google cần thiết để duy trì kết nối cho đến khi bạn ngắt kết nối, thu hồi quyền hoặc xoá tài khoản.',
          ],
        },
        {
          id: 'use-and-sharing',
          title: '4. Cách chúng tôi sử dụng và chia sẻ thông tin',
          paragraphs: [
            'Chúng tôi dùng thông tin để cung cấp tính năng Mindoist, xác thực tài khoản, đồng bộ dữ liệu bạn yêu cầu, duy trì bảo mật, khắc phục sự cố và cải thiện độ ổn định.',
            'Mindoist không bán thông tin cá nhân hoặc dữ liệu người dùng Google. Chúng tôi không dùng dữ liệu Google cho quảng cáo và không dùng dữ liệu đó để huấn luyện các mô hình trí tuệ nhân tạo dùng chung. Chúng tôi chỉ có thể dùng nhà cung cấp dịch vụ khi cần để vận hành Mindoist, và có thể tiết lộ thông tin khi pháp luật yêu cầu hoặc để bảo vệ người dùng và dịch vụ.',
          ],
        },
        {
          id: 'limited-use',
          title: '5. Chính sách dữ liệu người dùng của Dịch vụ API Google',
          paragraphs: ['Việc Mindoist sử dụng và chuyển cho ứng dụng khác bất kỳ thông tin nào nhận từ API Google sẽ tuân thủ Chính sách dữ liệu người dùng của Dịch vụ API Google, bao gồm các yêu cầu về Sử dụng có giới hạn.'],
        },
        {
          id: 'security',
          title: '6. Bảo mật',
          paragraphs: ['Chúng tôi áp dụng các biện pháp kỹ thuật và tổ chức hợp lý để bảo vệ dữ liệu tài khoản và kết nối. Không dịch vụ internet nào có thể bảo đảm an toàn tuyệt đối, vì vậy bạn cũng nên bảo vệ thông tin đăng nhập và thiết bị của mình.'],
        },
        {
          id: 'retention',
          title: '7. Lưu giữ và quyền kiểm soát của bạn',
          paragraphs: [
            'Chúng tôi lưu thông tin khi tài khoản còn hoạt động và trong thời gian cần thiết để cung cấp dịch vụ. Bạn có thể ngắt kết nối tài khoản Google trong Mindoist hoặc thu hồi quyền tại phần quyền của Tài khoản Google. Bạn cũng có thể xoá tài khoản Mindoist trong Cài đặt; thao tác này xoá dữ liệu tài khoản khỏi Mindoist, ngoại trừ phần lưu giữ giới hạn cần thiết cho bảo mật, pháp lý hoặc chu kỳ sao lưu.',
            'Ngắt kết nối hoặc xoá Mindoist không xoá sự kiện vốn được tạo trong Google Calendar. Các sự kiện Mindoist đã tạo trong Google Calendar vẫn được xử lý theo thao tác bạn yêu cầu và cơ chế của Google Calendar.',
          ],
        },
        {
          id: 'changes-contact',
          title: '8. Thay đổi và liên hệ',
          paragraphs: [`Chúng tôi có thể cập nhật chính sách khi Mindoist thay đổi. Ngày hiệu lực ở trên xác định phiên bản mới nhất. Gửi câu hỏi hoặc yêu cầu về quyền riêng tư tới ${SUPPORT_EMAIL}.`],
        },
      ] satisfies LegalSection[],
    },
    terms: {
      title: 'Điều khoản dịch vụ',
      description: 'Các quy tắc và trách nhiệm áp dụng khi bạn sử dụng Mindoist và các tích hợp tuỳ chọn.',
      effective: 'Có hiệu lực từ ngày 01/08/2026',
      sections: [
        {
          id: 'acceptance',
          title: '1. Chấp nhận điều khoản',
          paragraphs: ['Khi truy cập hoặc sử dụng Mindoist, bạn đồng ý với các Điều khoản này. Nếu không đồng ý, vui lòng không sử dụng dịch vụ.'],
        },
        {
          id: 'account',
          title: '2. Tài khoản của bạn',
          paragraphs: ['Bạn chịu trách nhiệm cung cấp thông tin tài khoản chính xác, bảo vệ thông tin đăng nhập và các hoạt động thực hiện qua tài khoản. Hãy báo ngay nếu bạn cho rằng tài khoản đã bị xâm phạm.'],
        },
        {
          id: 'service',
          title: '3. Sử dụng Mindoist',
          paragraphs: ['Mindoist cung cấp công cụ cho công việc, dự án, ghi chú, lập kế hoạch, tập trung, lịch và sao lưu. Bạn chỉ được sử dụng dịch vụ hợp pháp và không được can thiệp vào hoạt động, cố truy cập trái phép, phát tán mã độc hoặc lạm dụng người dùng hay dịch vụ được kết nối.'],
        },
        {
          id: 'content',
          title: '4. Nội dung của bạn',
          paragraphs: ['Bạn giữ quyền sở hữu nội dung thêm vào Mindoist. Bạn cấp cho Mindoist quyền giới hạn cần thiết để lưu, xử lý, hiển thị và đồng bộ nội dung đó chỉ nhằm cung cấp các tính năng bạn yêu cầu. Bạn chịu trách nhiệm bảo đảm mình có quyền sử dụng nội dung đã gửi.'],
        },
        {
          id: 'integrations',
          title: '5. Google và tích hợp bên thứ ba',
          paragraphs: [
            'Các dịch vụ kết nối là tuỳ chọn và cũng chịu điều khoản của nhà cung cấp tương ứng. Bạn kiểm soát dự án Mindoist nào đồng bộ với Google Calendar. Mindoist coi sự kiện lịch gốc từ Google là chỉ đọc và không xoá chúng; Mindoist chỉ quản lý sự kiện liên kết do mình tạo cho dự án bạn đã chọn.',
            'Dịch vụ bên thứ ba có thể thay đổi, giới hạn hoặc dừng API. Mindoist không chịu trách nhiệm cho gián đoạn hoặc thay đổi từ bên thứ ba, nhưng bạn có thể ngắt kết nối tích hợp bất cứ lúc nào.',
          ],
        },
        {
          id: 'availability',
          title: '6. Khả dụng và thay đổi',
          paragraphs: ['Chúng tôi hướng tới việc duy trì Mindoist ổn định, nhưng dịch vụ đôi lúc có thể không khả dụng. Chúng tôi có thể thay đổi, tạm ngưng hoặc dừng tính năng và sẽ thông báo hợp lý khi thay đổi ảnh hưởng đáng kể đến người dùng, nếu thực tế cho phép.'],
        },
        {
          id: 'termination',
          title: '7. Tạm ngưng và chấm dứt',
          paragraphs: ['Bạn có thể ngừng dùng Mindoist hoặc xoá tài khoản bất cứ lúc nào. Chúng tôi có thể tạm ngưng hoặc chấm dứt quyền truy cập khi cần hợp lý để xử lý hành vi lạm dụng, rủi ro bảo mật, nghĩa vụ pháp lý hoặc vi phạm nghiêm trọng Điều khoản này.'],
        },
        {
          id: 'disclaimer',
          title: '8. Tuyên bố miễn trừ và trách nhiệm',
          paragraphs: ['Mindoist được cung cấp theo tình trạng “sẵn có”. Trong phạm vi pháp luật cho phép, chúng tôi không bảo đảm hoạt động liên tục hoặc không có lỗi và không chịu trách nhiệm cho thiệt hại gián tiếp hoặc hệ quả từ việc sử dụng dịch vụ. Không nội dung nào trong Điều khoản này loại trừ quyền hoặc trách nhiệm mà pháp luật không cho phép loại trừ.'],
        },
        {
          id: 'changes-contact',
          title: '9. Thay đổi và liên hệ',
          paragraphs: [`Chúng tôi có thể cập nhật Điều khoản khi dịch vụ thay đổi. Ngày hiệu lực ở trên xác định phiên bản mới nhất. Gửi câu hỏi tới ${SUPPORT_EMAIL}.`],
        },
      ] satisfies LegalSection[],
    },
  },
} as const;
