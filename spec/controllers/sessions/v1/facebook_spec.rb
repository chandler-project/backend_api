require 'rails_helper'

RSpec.describe Api::V1::SessionsController, type: :controller do
  before(:each) do
    set_version('v1')
  end

  describe 'POST #facebook' do
    it 'create user with email' do
      expect {
        post :facebook, auth: {id: '123', email: 'abc@gmail.com', first_name: 'mai', last_name: 'nguyen'}, format: :json
      }.to change(User, :count).by(1)
      json_response = JSON.parse(@response.body)
      expect(json_response['uid']).to eq('123')
      expect(json_response['email']).to eq('abc@gmail.com')
      expect(json_response['first_name']).to eq('mai')
      expect(json_response['last_name']).to eq('nguyen')
    end
  end
end