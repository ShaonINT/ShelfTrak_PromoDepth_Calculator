import unittest
import pandas as pd
from io import BytesIO
from app import app

class TestPromoDepthApp(unittest.TestCase):
    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def test_index_route(self):
        response = self.app.get('/')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'ShelfTrak Promo Depth Calculator', response.data)

    def test_upload_file(self):
        # Create a dummy Excel file
        data = {'Price & Promo': ['400 - Save 33%', '200 - Buy 2 & Get 1 Free']}
        df = pd.DataFrame(data)
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False)
        output.seek(0)

        # Send post request
        response = self.app.post('/upload', data={
            'file': (output, 'test.xlsx')
        }, content_type='multipart/form-data')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Content-Disposition'], 'attachment; filename=Promo_Depth_Calculated.xlsx')

        # Verify content of the downloaded file
        downloaded_file = BytesIO(response.data)
        result_df = pd.read_excel(downloaded_file)
        
        self.assertIn('Promo Depth', result_df.columns)
        self.assertEqual(result_df.loc[0, 'Promo Depth'], 33.0)
        self.assertEqual(result_df.loc[1, 'Promo Depth'], 33.33)

if __name__ == '__main__':
    unittest.main()
