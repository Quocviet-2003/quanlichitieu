import os
import time
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("CHILOTUS_BASE_URL", "http://localhost:3000").rstrip("/")

OUTPUT_DIR = os.path.abspath("screenshots")
os.makedirs(OUTPUT_DIR, exist_ok=True)

USER_DATA = {
    "token": "mock-user-token",
    "user": '{"id":"u_demo","name":"Đặng Quốc Việt","email":"intern@chilotus.com","role":"USER","bio":"Chuyên viên quản lý tài chính cá nhân"}'
}

ADMIN_DATA = {
    "token": "mock-admin-token",
    "user": '{"id":"u_admin","name":"Quản trị viên ChiLotus","email":"admin@chilotus.com","role":"ADMIN","bio":"Quản trị viên hệ thống ChiLotus"}'
}

def auth_script(auth):
    """Doan JS duoc chay truoc moi script cua trang de dat san thong tin dang nhap."""
    return (
        "localStorage.setItem('token', '%s');"
        "localStorage.setItem('user', '%s');" % (auth["token"], auth["user"])
    )


def set_auth(page, auth):
    page.evaluate("() => { %s }" % auth_script(auth))


def open_page(page, url, wait=1500):
    """Mo mot trang can dang nhap (localStorage da duoc dat san qua init script)."""
    page.goto(url)
    page.wait_for_timeout(wait)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)

        # 1-2. Trang dang nhap / dang ky: context rieng, chua dang nhap
        guest = browser.new_context(viewport={"width": 1440, "height": 900})
        gpage = guest.new_page()
        print("1. Capturing login.html...")
        gpage.goto(BASE_URL + "/login.html")
        gpage.wait_for_timeout(1000)
        gpage.screenshot(path=os.path.join(OUTPUT_DIR, "01_dang_nhap.png"), full_page=True)
        print("2. Capturing register.html...")
        gpage.goto(BASE_URL + "/register.html")
        gpage.wait_for_timeout(1000)
        gpage.screenshot(path=os.path.join(OUTPUT_DIR, "02_dang_ky.png"), full_page=True)
        guest.close()
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        context.add_init_script(auth_script(USER_DATA))
        page = context.new_page()

        open_page(page, BASE_URL + "/index.html", 2000)

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
        open_page(page, BASE_URL + "/transactions.html", 1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "07_lich_su_giao_dich.png"), full_page=True)

        print("8. Capturing income.html...")
        open_page(page, BASE_URL + "/income.html", 1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "08_khoan_thu.png"), full_page=True)

        print("9. Capturing expense.html...")
        open_page(page, BASE_URL + "/expense.html", 1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "09_khoan_chi.png"), full_page=True)

        print("10. Capturing budget.html...")
        open_page(page, BASE_URL + "/budget.html", 1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "10_quan_ly_ngan_sach.png"), full_page=True)

        print("11. Capturing savings.html...")
        open_page(page, BASE_URL + "/savings.html", 1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "11_muc_tieu_tiet_kiem.png"), full_page=True)

        print("12. Capturing fixed-expenses.html...")
        open_page(page, BASE_URL + "/fixed-expenses.html", 1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "12_chi_phi_co_dinh.png"), full_page=True)

        print("13. Capturing reports.html...")
        open_page(page, BASE_URL + "/reports.html", 2000)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "13_bao_cao_thong_ke.png"), full_page=True)

        print("14. Capturing AI insight on reports.html...")
        ai_btn = page.query_selector("#ai-insight-btn")
        if ai_btn:
            ai_btn.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=os.path.join(OUTPUT_DIR, "14_nhan_xet_ai_bao_cao.png"), full_page=True)

        print("15. Capturing search.html...")
        open_page(page, BASE_URL + "/search.html", 1500)
        page.fill("#search-input", "lương")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "15_tim_kiem_giao_dich.png"), full_page=True)

        print("16. Capturing settings.html...")
        open_page(page, BASE_URL + "/settings.html", 1500)
        page.screenshot(path=os.path.join(OUTPUT_DIR, "16_cai_dat_tai_khoan.png"), full_page=True)

        print("17. Capturing admin.html...")
        admin_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        admin_ctx.add_init_script(auth_script(ADMIN_DATA))
        apage = admin_ctx.new_page()
        apage.goto(BASE_URL + "/admin.html")
        apage.wait_for_timeout(2000)
        apage.screenshot(path=os.path.join(OUTPUT_DIR, "17_quan_tri_admin.png"), full_page=True)
        admin_ctx.close()

        browser.close()
        print("All screenshots taken successfully!")

if __name__ == "__main__":
    main()
