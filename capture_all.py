import os
import time
from playwright.sync_api import sync_playwright

OUTPUT_DIR = os.path.abspath("screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

USER_DATA = {
    "token": "mock-user-token",
    "user": '{"id":"u_demo","name":"Đặng Quốc Việt","email":"intern@chilotus.com","role":"USER","bio":"Chuyên viên quản lý tài chính cá nhân"}'
}

ADMIN_DATA = {
    "token": "mock-admin-token",
    "user": '{"id":"u_admin","name":"Admin ChiLotus","email":"admin@chilotus.com","role":"ADMIN","bio":"Quản trị viên hệ thống ChiLotus"}'
}

def set_auth(page, auth):
    page.evaluate(f"""() => {{
        localStorage.setItem('token', '{auth["token"]}');
        localStorage.setItem('user', '{auth["user"]}');
    }}""")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        print("1. Capturing login.html...")
        page.goto("http://localhost:3000/login.html")
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "01_dang_nhap.png"), full_page=True)

        print("2. Capturing register.html...")
        page.goto("http://localhost:3000/register.html")
        page.wait_for_timeout(1000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "02_dang_ky.png"), full_page=True)

        # Setup user auth
        page.goto("http://localhost:3000/index.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(2000)

        print("3. Capturing index.html (Dashboard)...")
        page.screenshot(path=os.path.join(OUTPUT_DIR, "03_tong_quan_dashboard.png"), full_page=True)

        print("4. Capturing Chatbot AI...")
        chat_btn = page.query_selector("#ai-chat-toggle-btn")
        if chat_btn:
            chat_btn.click()
            page.wait_for_timeout(500)
            page.fill("#ai-chat-input", "Tình hình chi tiêu tháng này của tôi thế nào?")
            page.click("#ai-chat-send-btn")
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "04_chatbot_ai.png"))
            close_btn = page.query_selector("#ai-chat-close-btn")
            if close_btn:
                close_btn.click()
                page.wait_for_timeout(300)

        print("5. Capturing Notifications...")
        notif_btn = page.query_selector("#notif-bell-btn")
        if notif_btn:
            notif_btn.click()
            page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "05_thong_bao.png"))
            page.click("body")
            page.wait_for_timeout(300)

        print("6. Capturing Add Transaction Modal...")
        add_btn = page.query_selector("#layout-header .add-tx-btn")
        if add_btn:
            add_btn.click()
            page.wait_for_timeout(600)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "06_popup_them_giao_dich.png"))
            close_modal = page.query_selector("#tx-close-btn") or page.query_selector(".close-modal-btn")
            if close_modal:
                close_modal.click()
                page.wait_for_timeout(300)

        print("7. Capturing transactions.html...")
        page.goto("http://localhost:3000/transactions.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "07_lich_su_giao_dich.png"), full_page=True)

        print("8. Capturing income.html...")
        page.goto("http://localhost:3000/income.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "08_khoan_thu.png"), full_page=True)

        print("9. Capturing expense.html...")
        page.goto("http://localhost:3000/expense.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "09_khoan_chi.png"), full_page=True)

        print("10. Capturing budget.html...")
        page.goto("http://localhost:3000/budget.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "10_quan_ly_ngan_sach.png"), full_page=True)

        print("11. Capturing savings.html...")
        page.goto("http://localhost:3000/savings.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "11_muc_tieu_tiet_kiem.png"), full_page=True)

        print("12. Capturing fixed-expenses.html...")
        page.goto("http://localhost:3000/fixed-expenses.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "12_chi_phi_co_dinh.png"), full_page=True)

        print("13. Capturing reports.html...")
        page.goto("http://localhost:3000/reports.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "13_bao_cao_thong_ke.png"), full_page=True)

        print("14. Capturing AI insight on reports.html...")
        ai_btn = page.query_selector("#ai-insight-btn")
        if ai_btn:
            ai_btn.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "14_nhan_xet_ai_bao_cao.png"), full_page=True)

        print("15. Capturing search.html...")
        page.goto("http://localhost:3000/search.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.fill("#search-input", "lương")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "15_tim_kiem_giao_dich.png"), full_page=True)

        print("16. Capturing settings.html...")
        page.goto("http://localhost:3000/settings.html")
        set_auth(page, USER_DATA)
        page.reload()
        page.wait_for_timeout(1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "16_cai_dat_tai_khoan.png"), full_page=True)

        print("17. Capturing admin.html...")
        set_auth(page, ADMIN_DATA)
        page.wait_for_timeout(300)
        page.goto("http://localhost:3000/admin.html")
        page.wait_for_timeout(2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "17_quan_tri_admin.png"), full_page=True)

        browser.close()
        print("All screenshots taken successfully!")

if __name__ == "__main__":
    main()
